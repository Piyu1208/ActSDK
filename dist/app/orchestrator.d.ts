import 'dotenv/config';
import type { ActAgent, ActMessage, Interceptor } from './agent.ts';
export declare class OrchBuilder {
    instructions: string | undefined;
    agentList: ActAgent[];
    constructor();
    build(): Orchestrator;
    handoff(agents: ActAgent[]): this;
}
export declare class Orchestrator {
    private instructions;
    private messageHistory;
    private agentMap;
    private openai;
    private MAX_LOOPS;
    private interceptors;
    constructor(builder: OrchBuilder);
    builder(): OrchBuilder;
    attachInterceptor(interceptor: Interceptor): void;
    notifyInterceptor(message: ActMessage): void;
    run(query: string): Promise<ActMessage | undefined>;
}
//# sourceMappingURL=orchestrator.d.ts.map