import { ActBuilder } from './app/agent.js';
import { weatherTool, cliAccessTool } from './tools.js';
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
    const res = await weatherAgent.run('Create an index.html file in my current project displaying the current weather of Delhi.');
    console.log(res);
}
init();
//# sourceMappingURL=index.js.map