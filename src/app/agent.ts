import { HARNESS_PROMPT } from './config.js'; 

export interface ActTool  {
    name: string,
    description: string,
    doc?: string,
    executor: (input: string) => Promise<string>
}

export class ActBuilder {
    public instructions: string | undefined;
    public toolList: ActTool[];

    constructor() {
        this.toolList = [];
    }

    public tool(newTool: ActTool) {
        this.toolList.push(newTool);
        return this;
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
    private toolMap = new Map<string, ActTool>;

    constructor(builder: ActBuilder) {
        for (const t of builder.toolList) {
            this.toolMap.set(t.name, t)
        }


        this.instructions = `
        ${HARNESS_PROMPT}/n/n

        System Prompt:
        ${builder.instructions}/n/n

        Available Tools:
        ${builder.toolList.map(t => JSON.stringify({
            functionName: t.name,
            functionDescritption: t.description,
            functionDoc: t.doc
        })).join('\n')}
        `;


    }

    builder() {
        return new ActBuilder();
    }

    public showInstructions() {
        console.log(this.instructions);
    }
}