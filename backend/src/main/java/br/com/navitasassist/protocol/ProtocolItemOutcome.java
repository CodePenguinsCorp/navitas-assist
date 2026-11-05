package br.com.navitasassist.protocol;

public enum ProtocolItemOutcome {
    PASSED,
    FAILED,
    NOT_APPLICABLE;

    public boolean satisfiesRequirement() {
        return this == PASSED || this == NOT_APPLICABLE;
    }
}
