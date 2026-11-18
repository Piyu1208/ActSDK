import { ActBuilder } from './app/agent.js';
import { weatherTool, cliAccessTool, webSearchTool } from './tools.js';
async function init() {
    const codingAgent = new ActBuilder()
        .setInstructions('You are a coding agent.')
        .tool(cliAccessTool)
        .build('codingAgent');
    codingAgent.attachInterceptor((msg) => console.log(msg));
    const weatherAgent = new ActBuilder()
        .setInstructions("You are a realtime weather fetching agent.")
        .tool(weatherTool)
        .handoff([codingAgent])
        .build('weatherAgent');
    weatherAgent.attachInterceptor((msg) => console.log(msg));
    const researchAgent = new ActBuilder()
        .setInstructions("You are a research agent.")
        .tool(webSearchTool)
        .handoff([codingAgent, weatherAgent])
        .build('researchAgent');
    researchAgent.attachInterceptor((msg) => console.log(msg));
    const res = await researchAgent.run('Hey research about Narendra Modi and create a webpage about him, in my current folder. Basically create index.html and style it');
    console.log(res);
}
init();
//# sourceMappingURL=index.js.map