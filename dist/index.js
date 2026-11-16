import { ActBuilder } from './app/agent.js';
const weatherTool = {
    name: 'fetchWeather',
    description: 'fetches realtime weather data',
    doc: 'fetchWeather(cityName: string): Real time response',
    async executor(input) {
        return `The weather in ${input} is Cold.`;
    }
};
function init() {
    const agent = new ActBuilder()
        .setInstructions("You are an Agent in making.")
        .tool(weatherTool)
        .build();
    agent.showInstructions();
}
init();
//# sourceMappingURL=index.js.map