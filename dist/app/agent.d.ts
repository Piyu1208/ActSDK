export interface ActTool {
    name: string;
    description: string;
    doc?: string;
    executor: (input: string) => Promise<string>;
}
export declare class ActBuilder {
    instructions: string | undefined;
    toolList: ActTool[];
    constructor();
    tool(newTool: ActTool): this;
    build(): ActAgent;
    setInstructions(instructions: string): this;
}
export declare class ActAgent {
    private instructions;
    private toolMap;
    constructor(builder: ActBuilder);
    builder(): ActBuilder;
    showInstructions(): void;
}
//# sourceMappingURL=agent.d.ts.map