import { HARNESS_PROMPT } from './config.js';
export class ActBuilder {
    instructions;
    toolList;
    constructor() {
        this.toolList = [];
    }
    tool(newTool) {
        this.toolList.push(newTool);
        return this;
    }
    build() {
        return new ActAgent(this);
    }
    setInstructions(instructions) {
        this.instructions = instructions;
        return this;
    }
}
export class ActAgent {
    instructions;
    toolMap = new Map;
    constructor(builder) {
        for (const t of builder.toolList) {
            this.toolMap.set(t.name, t);
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
    showInstructions() {
        console.log(this.instructions);
    }
}
//# sourceMappingURL=agent.js.map