import "dotenv/config";
export interface ActTool {
    name: string;
    description: string;
    doc?: string;
    executor: (input: string) => Promise<string>;
}
export interface ActMessage {
    role: 'user' | 'assistant' | 'developer' | 'system';
    content: string;
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
    private messageHistory;
    private toolMap;
    private openai;
    private MAX_LOOPS;
    constructor(builder: ActBuilder);
    builder(): ActBuilder;
    showInstructions(): void;
    run(query: string): Promise<ActMessage[] | undefined>;
}
//# sourceMappingURL=agent.d.ts.map