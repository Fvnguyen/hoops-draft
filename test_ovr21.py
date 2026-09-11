import numpy as np
import random

def clamp(val, min_val, max_val):
    return max(min_val, min(val, max_val))

def calculate_ovr(profile_name, ratings, cfg):
    w_profile = np.array(cfg["PROFILES"][profile_name], float)
    r = np.array(ratings, float)
    
    t1, t2 = cfg["TOP1"], cfg["TOP2"]
    
    w_eff = w_profile * (1 - (t1 + t2)/100)
    
    # Sort ratings descending to find top 1 and top 2 indices
    sorted_r_idx = np.argsort(r)[::-1]
    
    w_eff[sorted_r_idx[0]] += t1
    w_eff[sorted_r_idx[1]] += t2
    
    raw = np.sum(w_eff * r / 100)
    
    # Forgive
    for i in range(7):
        if w_profile[i] <= cfg["OFFROLE_MAX_W"]:
            raw += cfg["FORGIVE"] * (w_profile[i] / 100) * max(0, cfg["REF"] - r[i])
            
    # Core-Gap Penalty
    # The 3 highest-weighted skills of the profile, including ties.
    w_sorted = np.sort(w_profile)[::-1]
    threshold = w_sorted[2] # 3rd highest weight
    
    core_penalty = 0
    for i in range(7):
        if w_profile[i] >= threshold:
            core_penalty += cfg["CORE_PEN"] * (w_profile[i] / 100) * max(0, cfg["CORE_REF"] - r[i])
            
    raw -= core_penalty
    
    return round(clamp(raw, 0, 100))

def test_all():
    cfg = {
        "TOP1": 10,
        "TOP2": 5,
        "FORGIVE": 0.5,
        "OFFROLE_MAX_W": 7,
        "REF": 60,
        "CORE_PEN": 1.0,
        "CORE_REF": 70,
        "PROFILES": {
            'PG':   [15, 10, 20, 30,  6, 14,  5],
            'SG':   [15, 18, 28, 14,  5, 15,  5],
            'SF':   [20, 14, 18, 10, 14, 17,  7],
            'PF':   [24, 13,  9,  5, 20, 11, 18],
            'C':    [24,  8,  4,  5, 29,  7, 23],
            'G':    [15, 14, 24, 22,  5, 15,  5],
            'F':    [22, 13, 13,  7, 17, 14, 14],
            'G/F':  [18, 14, 21, 14, 10, 16,  7],
            'F/C':  [24, 11,  6,  5, 24,  9, 21],
            'Gold': [14, 14, 14, 14, 14, 15, 15]
        }
    }
    
    # Test all-99
    print("Testing all-99...")
    for p in cfg["PROFILES"]:
        res = calculate_ovr(p, [99]*7, cfg)
        assert res == 99, f"Failed all-99 for {p}: {res}"
    print("All-99 passed!")
    
    # Monotonicity test
    print("Testing monotonicity (1000 random increments)...")
    for _ in range(1000):
        p = random.choice(list(cfg["PROFILES"].keys()))
        base_r = [random.randint(40, 98) for _ in range(7)]
        ovr1 = calculate_ovr(p, base_r, cfg)
        
        inc_idx = random.randint(0, 6)
        new_r = list(base_r)
        new_r[inc_idx] += 1
        
        ovr2 = calculate_ovr(p, new_r, cfg)
        assert ovr2 >= ovr1, f"Monotonicity failed for {p}: {base_r}->{new_r}, {ovr1}->{ovr2}"
        
    print("Monotonicity passed!")

if __name__ == "__main__":
    test_all()
