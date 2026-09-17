"""Stage 1: mechanical pre-filter of Claude Code transcripts.

Reads a project's .jsonl transcripts and emits, per session, a compact
text rendering: user turns verbatim, assistant prose truncated, tool
CALLS as one-liners, tool RESULTS dropped (that is where the bulk is).
No model involved. Read-only on the source.
"""
import json, os, sys, re, glob, datetime

ASSIST_CAP = 700      # chars of assistant prose per block
TOOLARG_CAP = 160     # chars of tool-arg summary
AGENT_CAP = 1200      # chars of a subagent's final report
ERR_CAP = 300         # chars of a failed tool result
ERR_RE = re.compile(r"(Traceback|SyntaxError|fatal:|error:|Error:|"
                    r"FAILED|AssertionError|command not found|"
                    r"Permission denied|refused|timed out)")


def ts(s):
    return (s or "")[:19].replace("T", " ")


def tool_summary(name, inp):
    if not isinstance(inp, dict):
        return ""
    for k in ("command", "file_path", "path", "pattern", "query", "url",
              "prompt", "description", "skill", "old_string"):
        if k in inp and isinstance(inp[k], str):
            v = " ".join(inp[k].split())
            if k in ("file_path", "path"):
                # keep the tail: the filename identifies the target, the
                # C:\Users\fabia\... prefix is the same on every line
                parts = re.split(r"[\\/]", v)
                v = "/".join(parts[-3:]) if len(parts) > 3 else v
            return f"{k}={v[:TOOLARG_CAP]}"
    return ",".join(list(inp)[:4])


def blocks(msg):
    c = msg.get("content")
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    return c if isinstance(c, list) else []


RUN_RE = re.compile(r"^    > (\w[\w:.]*)\(")


def collapse_runs(lines):
    """Fold a run of >=3 calls to the same tool into one line.

    Sweeps of Read/Grep over a directory are the single biggest source of
    bulk in the rendered transcript and carry no decision content beyond
    'it read these'. Keeps the first three args as a sample.
    """
    out, i = [], 0
    while i < len(lines):
        m = RUN_RE.match(lines[i])
        if not m:
            out.append(lines[i]); i += 1; continue
        tool, j = m.group(1), i
        while j < len(lines):
            m2 = RUN_RE.match(lines[j])
            if not m2 or m2.group(1) != tool:
                break
            j += 1
        n = j - i
        if n < 3:
            out.extend(lines[i:j])
        else:
            args = [l.split("(", 1)[1].rstrip(")") for l in lines[i:j]]
            sample = "; ".join(a[:70] for a in args[:3])
            out.append(f"    > {tool} x{n}  [{sample}; ...]")
        i = j
    return out


def extract(path):
    out, meta = [], {"file": os.path.basename(path), "title": None,
                     "cwd": None, "branch": set(), "first": None,
                     "last": None, "versions": set()}
    stats = {"user_turns": 0, "tool_calls": 0, "sidechain_msgs": 0,
             "commands": [], "files": set(), "commits": [], "tools": {},
             "errors": 0, "agent_runs": 0}
    tool_names = {}
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        t = d.get("type")
        if d.get("timestamp"):
            meta["first"] = meta["first"] or d["timestamp"]
            meta["last"] = d["timestamp"]
        if d.get("cwd"):
            meta["cwd"] = d["cwd"]
        if d.get("gitBranch"):
            meta["branch"].add(d["gitBranch"])
        if d.get("version"):
            meta["versions"].add(d["version"])
        if t == "ai-title":
            meta["title"] = d.get("aiTitle") or meta["title"]
        side = d.get("isSidechain")
        if side and t in ("user", "assistant"):
            stats["sidechain_msgs"] += 1
            continue
        if t == "system" and d.get("subtype") == "local_command":
            c = d.get("content", "")
            if not c.startswith("<local-command-stdout>"):
                out.append(f"[{ts(d.get('timestamp'))}] CMD  {c[:200]}")
            continue
        if t == "user" and not d.get("isMeta"):
            for b in blocks(d.get("message", {})):
                bt = b.get("type")
                if bt == "text":
                    txt = b["text"].strip()
                    if not txt or txt.startswith("<"):
                        continue
                    stats["user_turns"] += 1
                    out.append(f"\n[{ts(d.get('timestamp'))}] USER: {txt}")
                elif bt == "tool_result":
                    nm = tool_names.get(b.get("tool_use_id"), "")
                    c = b.get("content")
                    if isinstance(c, list):
                        c = " ".join(x.get("text", "") for x in c
                                     if isinstance(x, dict))
                    c = " ".join(str(c or "").split())
                    if nm in ("Agent", "Task"):
                        # async launches only ack; the real report is in
                        # subagents/*.jsonl, collected separately below
                        if c.startswith("Async agent launched"):
                            continue
                        stats["agent_runs"] += 1
                        out.append(f"    < AGENT REPORT: {c[:AGENT_CAP]}")
                    elif b.get("is_error") or ERR_RE.search(c[:400]):
                        stats["errors"] += 1
                        out.append(f"    ! FAILED {nm}: {c[:ERR_CAP]}")
        elif t == "assistant":
            for b in blocks(d.get("message", {})):
                bt = b.get("type")
                if bt == "text":
                    txt = " ".join(b["text"].split())
                    if txt:
                        out.append(f"  CLAUDE: {txt[:ASSIST_CAP]}")
                elif bt == "tool_use":
                    n = b.get("name", "?")
                    tool_names[b.get("id")] = n
                    stats["tool_calls"] += 1
                    stats["tools"][n] = stats["tools"].get(n, 0) + 1
                    inp = b.get("input", {})
                    s = tool_summary(n, inp)
                    if n in ("Edit", "Write", "NotebookEdit") and isinstance(inp, dict):
                        fp = inp.get("file_path", "")
                        if fp:
                            stats["files"].add(fp)
                    if n in ("Bash", "PowerShell") and isinstance(inp, dict):
                        cmd = " ".join(str(inp.get("command", "")).split())
                        if cmd:
                            stats["commands"].append(cmd[:300])
                        if re.search(r"\bgit\s+commit\b", cmd):
                            stats["commits"].append(cmd[:300])
                    out.append(f"    > {n}({s})")
    out = collapse_runs(out)
    meta["branch"] = sorted(meta["branch"])
    meta["versions"] = sorted(meta["versions"])
    stats["files"] = sorted(stats["files"])
    return meta, stats, out


def subagent_reports(src, session_id):
    """Final report + brief of each subagent this session spawned."""
    d = os.path.join(src, session_id, "subagents")
    if not os.path.isdir(d):
        return []
    rows = []
    for meta_p in sorted(glob.glob(os.path.join(d, "*.meta.json"))):
        jl = meta_p.replace(".meta.json", ".jsonl")
        try:
            m = json.load(open(meta_p, encoding="utf-8"))
        except Exception:
            m = {}
        last, first_prompt = "", ""
        if os.path.exists(jl):
            for line in open(jl, encoding="utf-8", errors="replace"):
                try:
                    e = json.loads(line)
                except Exception:
                    continue
                msg = e.get("message", {})
                if e.get("type") == "assistant":
                    for b in blocks(msg):
                        if b.get("type") == "text" and b.get("text", "").strip():
                            last = " ".join(b["text"].split())
                elif e.get("type") == "user" and not first_prompt:
                    for b in blocks(msg):
                        if b.get("type") == "text":
                            first_prompt = " ".join(b["text"].split())
        rows.append(f"- [{m.get('agentType','?')}/{m.get('model','?')}] "
                    f"{m.get('description','(no description)')}\n"
                    f"    TASK: {first_prompt[:400]}\n"
                    f"    RESULT: {last[:AGENT_CAP]}")
    return rows


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    index = []
    for p in sorted(glob.glob(os.path.join(src, "*.jsonl"))):
        meta, stats, out = extract(p)
        body = "\n".join(out)
        name = meta["file"].replace(".jsonl", "")
        head = ["# " + (meta["title"] or name),
                f"session: {name}",
                f"window: {ts(meta['first'])} -> {ts(meta['last'])}",
                f"cwd: {meta['cwd']}  branch: {','.join(meta['branch'])}",
                f"user turns: {stats['user_turns']}  tool calls: {stats['tool_calls']}"
                f"  subagent msgs: {stats['sidechain_msgs']}",
                f"tools: " + ", ".join(f"{k}:{v}" for k, v in
                                       sorted(stats['tools'].items(), key=lambda x: -x[1])[:12]),
                f"files edited ({len(stats['files'])}): " + ", ".join(
                    os.path.basename(f) for f in stats['files'][:40]),
                f"commits attempted: {len(stats['commits'])}"
                f"  subagent runs: {stats['agent_runs']}"
                f"  failed tool calls: {stats['errors']}",
                "", "---", ""]
        subs = subagent_reports(src, name)
        tail = ("\n\n=== SUBAGENT RUNS (%d) ===\n" % len(subs) + "\n".join(subs)) if subs else ""
        txt = "\n".join(head) + body + tail
        op = os.path.join(dst, name + ".txt")
        with open(op, "w", encoding="utf-8") as f:
            f.write(txt)
        index.append({"session": name, "title": meta["title"],
                      "first": ts(meta["first"]), "last": ts(meta["last"]),
                      "cwd": meta["cwd"], "branch": meta["branch"],
                      "src_bytes": os.path.getsize(p), "out_bytes": len(txt.encode("utf-8")),
                      "user_turns": stats["user_turns"], "tool_calls": stats["tool_calls"],
                      "sidechain_msgs": stats["sidechain_msgs"],
                      "files_edited": len(stats["files"]), "commits": len(stats["commits"]),
                      "agent_runs": stats["agent_runs"], "errors": stats["errors"]})
    with open(os.path.join(dst, "_index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)
    tot_s = sum(i["src_bytes"] for i in index)
    tot_o = sum(i["out_bytes"] for i in index)
    print(f"{len(index)} sessions  src={tot_s/1e6:.1f}MB  out={tot_o/1e6:.2f}MB  "
          f"ratio={tot_s/max(tot_o,1):.0f}x")
    for i in sorted(index, key=lambda x: x["first"]):
        print(f"{i['first'][:10]}  {i['out_bytes']/1024:7.0f}KB  "
              f"u{i['user_turns']:<4} t{i['tool_calls']:<5} f{i['files_edited']:<4} "
              f"{(i['title'] or '(untitled)')[:60]}")


main(sys.argv[1], sys.argv[2])
