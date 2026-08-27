def calculate_risk_and_action(deepfake_prob: float, speaker_match: float, metadata_risk: bool):
    # Rule 1: High deepfake probability
    if deepfake_prob > 0.75:
        return "HIGH_RISK_IMPERSONATION", "REQUIRE_MFA", 95
    
    # Rule 2: Voice is real, but doesn't match historical profile
    if speaker_match < 0.50:
        return "UNKNOWN_SPEAKER", "WARN_AGENT", 65
    
    # Rule 3: Safe
    return "GENUINE_CALLER", "ALLOW", 10

