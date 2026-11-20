import { ORCHESTRATOR_PROMPT } from './config.js';
import OpenAI from 'openai';
import 'dotenv/config';
import type { ActAgent, ActMessage, Interceptor } from './agent.ts';


export class OrchBuilder {
    public instructions: string | undefined;
    public agentList: ActAgent[];

    constructor() {
        this.agentList = [];
    }

    public build() {
        return new Orchestrator(this);
    }

    public handoff(agents: ActAgent[]) {
        this.agentList.push(...agents);
        return this;
    }

}

export class Orchestrator {
    private instructions;
    private messageHistory: ActMessage[];
    private agentMap: Map<string, ActAgent>;
    private openai: OpenAI;

    private MAX_LOOPS = 20;
    private interceptors: Interceptor[];

    constructor(builder: OrchBuilder) {
        this.agentMap = new Map();
        this.openai = new OpenAI({
            baseURL: 'https://aicredits.in/v1',
            apiKey: process.env.OPENAI_API_KEY
        });

        for (const a of builder.agentList) {
            this.agentMap.set(a.name, a);
        }

        this.instructions = `
        ${ORCHESTRATOR_PROMPT}/n/n

        Available Agents:
        ${builder.agentList.map(a => JSON.stringify({
            agentName: a.name
        })).join('\n')}
        `;

        this.messageHistory = [];
        this.interceptors = [];
    }

    builder() {
        return new OrchBuilder();
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

        for (let i=0; i<this.MAX_LOOPS; i++) {

            // LLM response = LLM Call ( sysPrompt + history )
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


            // append LLM response to history
            this.messageHistory.push({
                role: 'assistant',
                content: response.output_text
            });

            this.notifyInterceptor({
                role: 'assistant',
                content: response.output_text
            });

            // parse LLM response
            const parsedResponse = JSON.parse(response.output_text);

            // if (parsedResponse.step === "output"):
            //     return history

            if (parsedResponse.step.toLowerCase() === 'output') {
                return this.messageHistory[this.messageHistory.length - 1];
            }


            // if (parsedResponse.step === 'handoff'):
            //    {agentName, input} = parsedResponse;
            
            //  if (!agent):
            //    history.push(errmsg)
            //    continue

            //  handoff_result = agentName(input);
            //  history.push(handOff_result)

            if (parsedResponse.step.toLowerCase() === 'handoff') {
                const { agentName, input } = parsedResponse;
                const agent = this.agentMap.get(agentName) as ActAgent;

                if (!agent) {
                    this.messageHistory.push({
                        role: 'developer',
                        content: `Error: agent with name ${agentName} does not exist.`
                    });

                    this.notifyInterceptor({
                        role: 'developer',
                        content: `Error: agent with agent name ${agentName} does not exist.`                        
                    });       
                    
                    continue;
                }

                const agentRes = await agent.run(input) as ActMessage;
                this.messageHistory.push({
                    role: 'developer',
                    content: JSON.stringify({
                        agentName,
                        input,
                        agentRes: agentRes.content
                    })
                });

                this.notifyInterceptor({
                    role: 'developer',
                    content: JSON.stringify({
                        agentName,
                        input,
                        agentRes: JSON.parse(agentRes.content).text
                    })
                });                
            }

        }
    }

}