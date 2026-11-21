import { ActBuilder } from './app/agent.js';
import type { ActAgent } from './app/agent.js';
import { OrchBuilder } from './app/orchestrator.js';
import type { Orchestrator } from './app/orchestrator.js';
import { weatherTool, cliAccessTool, webSearchTool } from './tools.js';
import { fileTools } from './fileTools.js';



async function init() {
    const codingAgent: ActAgent = new ActBuilder()
    .setInstructions('You are a coding agent.')
    .tool(fileTools)
    .build('codingAgent');

    codingAgent.attachInterceptor((msg) => console.log(msg));


    const weatherAgent: ActAgent = new ActBuilder()
        .setInstructions("You are a realtime weather fetching agent.")
        .tool([weatherTool])
        .build('weatherAgent');

    weatherAgent.attachInterceptor((msg) => console.log(msg));

    const researchAgent: ActAgent = new ActBuilder() 
        .setInstructions("You are a research agent.")
        .tool([webSearchTool])
        .build('researchAgent');

    researchAgent.attachInterceptor((msg) => console.log(msg));


    const orchestrator: Orchestrator = new OrchBuilder()
    .handoff([codingAgent, weatherAgent, researchAgent])
    .build();

    orchestrator.attachInterceptor((msg) => console.log(msg));

    const res = await orchestrator.run(`Hey what's the current weather of Kota like and also give some information about Kota? Create a .txt file in my current folder displaying this information. I am using Windows powershell`);
    console.log(res);
}

init();
