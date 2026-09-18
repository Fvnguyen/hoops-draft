/**
 * Identity flavour lines (plan D5). One pool per archetype id in `engine/archetypes.ts`
 * ARCHETYPES; `beats.ts` picks a variant deterministically and fills the placeholders
 * from the quarter-so-far stats it computes.
 *
 * Placeholders: {team} {q} and the IdentityStats keys below. House style: present tense,
 * no exclamation marks, under 110 characters once filled.
 */

/** Stats for the identity's team over the quarter so far (offense = own possessions). */
export interface IdentityStats {
  /** Own field goals: threes, mid-range, rim. */
  tpm: number; tpa: number;
  midm: number; mida: number;
  rimm: number; rima: number;
  /** Points scored on possessions that ended with a rim make (paint points). */
  paint: number;
  /** Own offensive rebounds and assisted makes. */
  oreb: number;
  ast: number;
  /** Own possessions so far this quarter and points scored. */
  poss: number;
  pts: number;
  /** Opponent shooting against this team: threes, rim, and turnovers forced. */
  opptpm: number; opptpa: number;
  opprimm: number; opprima: number;
  forced: number;
  /** Opponent points this quarter so far. */
  opppts: number;
}

export type IdentityVars = IdentityStats & { team: string; q: string };

export const IDENTITY_TEMPLATES: Record<string, string[]> = {
  'rim-pressure': [
    '{team} keep getting downhill: {paint} points in the paint so far in {q}.',
    'Rim Pressure is the plan for {team}. {rimm} of {rima} at the rim this quarter.',
    'Everything goes toward the basket for {team}: {paint} paint points in {q} already.',
    '{team} live at the rim, {rimm} for {rima} inside this quarter.',
  ],
  'midrange-clinic': [
    'Midrange Clinic in session: {team} are {midm} of {mida} from the elbows in {q}.',
    '{team} keep pulling up from fifteen feet, {midm} for {mida} this quarter.',
    'The mid-range is home for {team}: {midm} of {mida} on the in-between shots.',
    'No rush for {team}, they take the pull-up: {midm}-{mida} from mid-range in {q}.',
  ],
  'shooting-gallery': [
    'Shooting Gallery open: {team} are {tpm} of {tpa} from deep in {q}.',
    '{team} keep letting it fly, {tpm} for {tpa} from three this quarter.',
    'Every kick-out is a shot for {team}: {tpm} of {tpa} from beyond the arc.',
    'The arc belongs to {team} tonight, {tpm}-{tpa} on threes so far in {q}.',
  ],
  'beautiful-game': [
    'The Beautiful Game for {team}: {ast} assisted baskets in {q} and the ball never sticks.',
    '{team} keep moving it, {ast} assists on their makes this quarter.',
    'Extra pass after extra pass for {team}: {ast} assisted scores in {q}.',
    '{team} play the pass-first game, {pts} points on {poss} trips so far.',
  ],
  'second-chance-engine': [
    'Second-Chance Engine running: {oreb} offensive boards for {team} in {q}.',
    '{team} keep the possession alive, {oreb} offensive rebounds this quarter.',
    'The glass feeds {team}: {oreb} second-chance possession(s) in {q} and {paint} paint points.',
    'Miss it, get it back: {oreb} offensive boards for {team} so far this quarter.',
  ],
  'no-fly-zone': [
    'No-Fly Zone in effect: opponents are {opptpm} of {opptpa} from three against {team} in {q}.',
    '{team} run shooters off the line, {opptpm} for {opptpa} allowed from deep this quarter.',
    'Nothing clean from the arc against {team}: {opptpm} of {opptpa} so far in {q}.',
    '{team} chase every three: opponents {opptpm}-{opptpa} from deep this quarter.',
  ],
  'paint-wall': [
    'Paint Wall holding: opponents are {opprimm} of {opprima} at the rim against {team} in {q}.',
    '{team} wall off the lane, {opprimm} for {opprima} allowed inside this quarter.',
    'Nothing easy at the rim against {team}: {opprimm} of {opprima} inside so far in {q}.',
    '{team} own the paint on defence, {opprimm}-{opprima} allowed at the rim this quarter.',
  ],
  'inside-out': [
    'Inside-Out for {team}: {paint} paint points and {tpm} of {tpa} from deep in {q}.',
    '{team} punish either choice, {rimm} of {rima} at the rim and {tpm} threes this quarter.',
    'Drive and kick keeps working for {team}: {paint} inside, {tpm}-{tpa} from three.',
    'The paint opens the arc for {team}: {paint} paint points, {tpm} threes so far in {q}.',
  ],
  'elbow-orchestra': [
    'Elbow Orchestra tuning up: {team} are {midm} of {mida} from mid-range in {q}.',
    '{team} run everything through the elbows, {midm} for {mida} on pull-ups this quarter.',
    'Passes off the elbow, jumpers off the catch: {midm}-{mida} from mid-range for {team}.',
    '{team} conduct from the elbows: {ast} assists and {midm} mid-range makes in {q}.',
  ],
  'pick-and-roll-republic': [
    'Pick-and-Roll Republic: {team} keep rolling to the rim, {rimm} of {rima} inside in {q}.',
    'Screen, roll, finish for {team}: {paint} paint points this quarter.',
    '{team} run the two-man game to death, {ast} assists and {paint} paint points so far.',
    'The roll man eats for {team}: {rimm} for {rima} at the rim in {q}.',
  ],
  'spacing-machine': [
    'Spacing Machine humming: {team} are {tpm} of {tpa} from three in {q}.',
    'Four shooters and room to work for {team}: {tpm} for {tpa} from deep this quarter.',
    'The floor stays wide for {team}, {tpm}-{tpa} on threes so far in {q}.',
    '{team} spread it and let it fly: {tpm} of {tpa} from beyond the arc this quarter.',
  ],
  'junkyard-dogs': [
    'Junkyard Dogs work: {team} have forced {forced} turnovers in {q}.',
    '{team} get their hands on everything, {forced} takeaways this quarter.',
    'Nothing comes easy against {team}: {forced} turnovers forced and {opppts} allowed in {q}.',
    '{team} scrap for every loose ball, {forced} forced turnovers so far this quarter.',
  ],
  'glass-fortress': [
    'Glass Fortress holding: opponents are {opprimm} of {opprima} at the rim against {team}.',
    '{team} end possessions with a body on the glass, {opprimm} for {opprima} allowed inside.',
    'One shot and out against {team}: {opprimm}-{opprima} at the rim in {q}.',
    '{team} guard the rim and the rebound, {opppts} allowed so far in {q}.',
  ],
  'crash-and-finish': [
    'Crash and Finish for {team}: {oreb} offensive boards turn into {rimm} of {rima} at the rim in {q}.',
    '{team} crash the glass and finish, {oreb} second-chance boards and {paint} paint points in {q}.',
    'Offensive boards become rim shots for {team}: {oreb} put-backs so far this quarter.',
    '{team} won\'t let a miss end the possession, {oreb} boards and {rimm} rim makes in {q}.',
  ],
  '3-and-d-paradigm': [
    '3-and-D Paradigm: {team} are {tpm} of {tpa} from deep and hold opponents to {opptpm}-{opptpa}.',
    '{team} shoot it and guard it: {tpm} threes made, {opptpm} allowed in {q}.',
    'Threes on one end, closeouts on the other for {team}: {tpm}-{tpa} and {opptpm}-{opptpa} allowed.',
    '{team} win the arc both ways, {tpm} of {tpa} made and {opptpm} of {opptpa} allowed this quarter.',
  ],
  'switchblade-pressure': [
    'Switchblade Pressure: {team} have forced {forced} turnovers and scored {paint} in the paint in {q}.',
    '{team} switch everything and run: {forced} takeaways this quarter.',
    'Turnovers become layups for {team}, {forced} forced and {rimm} rim makes in {q}.',
    '{team} press, switch, attack: {forced} forced turnovers so far this quarter.',
  ],
  'five-out-fortress': [
    'Five-Out Fortress: {team} are {tpm} of {tpa} from three and allow {opprimm}-{opprima} inside.',
    '{team} spread the floor and protect the rim, {tpm} threes and {opprimm} rim makes allowed.',
    'Five shooters out, one wall back for {team}: {tpm}-{tpa} from deep in {q}.',
    '{team} stretch it on offence and pack it on defence: {opprimm} of {opprima} allowed at the rim.',
  ],
  // card_balance T3 (2026-09-17): no single stat category is "positionless" the way
  // threes or rim makes are — mixes scoring (paint/pts) with playmaking (ast) since the
  // identity's whole point is a lineup that doesn't specialize in one thing.
  'positionless-revolution': [
    'Positionless Revolution: {team} have {paint} paint points and {ast} assists in {q} — no fixed jobs.',
    'No set positions for {team} tonight, {pts} points on {ast} assists so far in {q}.',
    '{team} play five interchangeable pieces: {paint} paint points, {ast} assists, no defender knows who to guard.',
    'Everyone does everything for {team} in {q}: {ast} assists and {paint} points inside from all over the floor.',
  ],
};

/** Fill `{key}` placeholders from vars; unknown keys are left as-is. */
export function fillIdentityTemplate(template: string, vars: IdentityVars): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = (vars as unknown as Record<string, string | number | undefined>)[key];
    return v === undefined ? m : String(v);
  });
}

/** Deterministic variant: (quarter + possession index) % pool length. */
export function identityLine(archetypeId: string, quarter: number, possessionIndex: number, vars: IdentityVars): string | null {
  const pool = IDENTITY_TEMPLATES[archetypeId];
  if (!pool || pool.length === 0) return null;
  const idx = ((quarter + possessionIndex) % pool.length + pool.length) % pool.length;
  return fillIdentityTemplate(pool[idx], vars);
}
