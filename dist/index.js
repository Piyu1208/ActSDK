import { ActBuilder } from './app/agent.js';
const weatherTool = {
    name: 'fetchWeather',
    description: 'fetches realtime weather data',
    doc: 'fetchWeather(cityName: string): Real time response',
    async executor(input) {
        return `The weather in ${input} is Cold.`;
    }
};
async function init() {
    const agent = new ActBuilder()
        .setInstructions("You are an Agent in making.")
        .tool(weatherTool)
        .build();
    const res = await agent.run('What is the weather in Mumbai and Delhi like?');
    console.log(res);
}
init();
//# sourceMappingURL=index.js.map