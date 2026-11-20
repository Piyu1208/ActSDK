import { HARNESS_PROMPT } from './config.js';
import OpenAI from "openai";
import "dotenv/config";

export interface ActTool {
    name: string,
    description: string,
    doc?: string,
    executor: (input: string) => Promise<string>
}

export interface ActMessage {
    role: 'user' | 'assistant' | 'developer' | 'system',
    content: string
}

export type Interceptor = (message: ActMessage) => void

export class ActBuilder {
    public instructions: string | undefined;
    public toolList: ActTool[];
    public agentList: ActAgent[];

    constructor() {
        this.toolList = [];
        this.agentList = [];
    }

    public tool(newTool: ActTool) {
        this.toolList.push(newTool);
        return this;
    }

    public handoff(agents: ActAgent[]) {
        this.agentList.push(...agents);
        return this;
    }

    public build(name: string) {
        return new ActAgent(this, name);
    }

    public setInstructions(instructions: string) {
        this.instructions = instructions;
        return this;
    }
}


export class ActAgent {
    public name;
    private instructions: string;
    private messageHistory: ActMessage[];
    private toolMap: Map<string, ActTool>;
    private agentMap: Map<string, ActAgent>;
    private openai: OpenAI;

    private MAX_LOOPS = 20;
    private interceptors: Interceptor[];

    constructor(builder: ActBuilder, name: string) {
        this.name = name;
        this.toolMap = new Map();
        this.agentMap = new Map();
        this.openai = new OpenAI({
            baseURL: 'https://aicredits.in/v1',
            apiKey: process.env.OPENAI_API_KEY
        })

        for (const t of builder.toolList) {
            this.toolMap.set(t.name, t)
        }

        for (const a of builder.agentList) {
            this.agentMap.set(a.name, a);
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

        Available Agents: 
        ${builder.agentList.map(a => JSON.stringify({
            agentName: a.name
        })).join('\n')}
        `;

        this.messageHistory = [];
        this.interceptors = [];
    }

    builder() {
        return new ActBuilder();
    }

    public showInstructions() {
        console.log(this.instructions);
    }

    public attachInterceptor(interceptor: Interceptor) {
        this.interceptors.push(interceptor);
    }

    public notifyInterceptor(message: ActMessage) {
        for (const interceptor of this.interceptors) {
            interceptor(message);
        }
    }

    public async run(query: string) {

        // append user query to history
        this.messageHistory.push({
            role: 'user',
            content: query
        });

        for (let i = 0; i < this.MAX_LOOPS; i++) {

            // LLM Response = LLM Call ( sysPrompt + history )
            const response = await this.openai.responses.create({
                model: 'gpt-4o-mini',
                input: [
                    {
                        role: 'system',
                        content: this.instructions
                    },
                    ...this.messageHistory.map(e => ({
                        role: e.role,
                        content: e.content
                    }))
                ]
            });

            // append LLM Response to history
            this.messageHistory.push({
                role: 'assistant',
                content: response.output_text
            });

            this.notifyInterceptor({
                role: 'assistant',
                content: response.output_text                
            })

            // parse LLM Response
            const parsedResponse = JSON.parse(response.output_text);


            // if (parsedResponse.step === "output") :
            //       return history;

            if (parsedResponse.step.toLowerCase() === 'output') {
                return this.messageHistory[this.messageHistory.length - 1];
            }

            // if (parsedResponse.step === "tool_request") :
            //    {toolName, input} = parsedResponse;

            //    if (!tool) :
            //       history.push(errmsg)
            //       continue

            //    toolResult = toolName(input);
            //    history.push(toolResult)


            if (parsedResponse.step.toLowerCase() === 'handoff') {
                const { agentName, input } = parsedResponse;
                const agent = this.agentMap.get(agentName) as ActAgent;

                if (!agent) {
                    this.messageHistory.push({
                        role: 'developer',
                        content: `Error: agent with agent name ${agentName} does not exist.`
                    });

                    this.notifyInterceptor({
                        role: 'developer',
                        content: `Error: agent with agent name ${agentName} does not exist.`                        
                    });

                    continue;
                }

                const res = await agent.run(input);
                console.log(res);
                return;
            }

            if (parsedResponse.step.toLowerCase() === 'tool_request') {
                const { functionName, input } = parsedResponse;
                const tool = this.toolMap.get(functionName);

                if (!tool) {
                    this.messageHistory.push({
                        role: 'developer',
                        content: `Error: tool with tool name ${functionName} does not exist.`
                    });

                    this.notifyInterceptor({
                        role: 'developer',
                        content: `Error: tool with tool name ${functionName} does not exist.`                        
                    })

                    continue;
                }

                const toolResult = await tool.executor(input);
                this.messageHistory.push({
                    role: 'developer',
                    content: JSON.stringify({
                        functionName,
                        input,
                        toolResult
                    })
                });

                this.notifyInterceptor({
                    role: 'developer',
                    content: JSON.stringify({
                        functionName,
                        input,
                        toolResult
                    })                    
                });
            }

        }
    }
}


