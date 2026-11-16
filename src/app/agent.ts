export class ActBuilder {
    public instructions: string | undefined;


    constructor() {

    }

    public build() {
        return new ActAgent(this);
    }

    public setInstructions(instructions: string) {
        this.instructions = instructions;
        return this;
    }
}


export class ActAgent {
    private instructions: string;

    constructor(builder: ActBuilder) {
        this.instructions = builder.instructions ?? '';
    }

    builder() {
        return new ActBuilder();
    }

    public showInstructions() {
        console.log(this.instructions);
    }
}