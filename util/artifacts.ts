export class Artifacts {
    public VestingWallet: any;
    public DummyToken: any;

    constructor(artifacts: any) {
        this.VestingWallet = artifacts.require('VestingWallet');
        this.DummyToken = artifacts.require('DummyToken');
    }
}
