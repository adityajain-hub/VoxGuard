def calculate_risk_and_action(deepfake_prob: float, speaker_match: float, metadata_risk: bool):
    # Rule 1: High deepfake probability
    if deepfake_prob > 0.75:
        return "HIGH_RISK_IMPERSONATION", "REQUIRE_MFA", 95

    # Rule 2: Voice is real, but doesn't match historical profile
    if speaker_match < 0.50:
        return "UNKNOWN_SPEAKER", "WARN_AGENT", 65

    # Rule 3: Voice seems real and matches, but metadata is suspicious
    # (e.g., VoIP origin, spoofed caller ID, known fraud number)
    if metadata_risk:
        return "METADATA_ANOMALY", "FLAG_FOR_REVIEW", 45

    # Rule 4: Safe
    return "GENUINE_CALLER", "ALLOW", 10
