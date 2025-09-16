// Mock data for MCP server tests

const MOCK_TOOL_LIST = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    tools: [
      {
        name: "get_alerts",
        description: "Get weather alerts for a state",
        inputSchema: {
          type: "object",
          properties: {
            state: {
              type: "string",
              minLength: 2,
              maxLength: 2,
              description: "Two-letter state code (e.g. CA, NY)",
            },
          },
          required: ["state"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
      },
      {
        name: "get_forecast",
        description: "Get weather forecast for a location",
        inputSchema: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude of the location",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude of the location",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
      },
    ],
  },
};

const MOCK_FORECAST_RESPONSE = {
  jsonrpc: "2.0",
  id: 4,
  result: {
    content: [
      {
        type: "text",
        text:
          "Forecast for 47.6062, -122.3321:\n\nThis Afternoon:\nTemperature: 69°F\nWind: 8 mph NNW\nSunny\n---\nTonight:\nTemperature: 56°F\nWind: 3 to 10 mph NNE\nMostly Clear\n---\nTuesday:\nTemperature: 85°F\nWind: 5 to 9 mph ESE\nSunny then Haze\n---\nTuesday Night:\nTemperature: 60°F\nWind: 2 to 6 mph SSE\nHaze then Clear\n---\nWednesday:\nTemperature: 76°F\nWind: 3 to 8 mph WNW\nSunny\n---\nWednesday Night:\nTemperature: 56°F\nWind: 3 to 8 mph N\nMostly Clear\n---\nThursday:\nTemperature: 71°F\nWind: 3 to 9 mph N\nMostly Sunny\n---\nThursday Night:\nTemperature: 56°F\nWind: 2 to 8 mph N\nMostly Clear\n---\nFriday:\nTemperature: 74°F\nWind: 2 to 6 mph NNW\nSunny\n---\nFriday Night:\nTemperature: 56°F\nWind: 5 mph WSW\nPartly Cloudy\n---\nSaturday:\nTemperature: 69°F\nWind: 7 mph SSW\nPartly Sunny then Chance Light Rain\n---\nSaturday Night:\nTemperature: 59°F\nWind: 6 to 9 mph SSW\nChance Light Rain\n---\nSunday:\nTemperature: 69°F\nWind: 7 mph SSW\nChance Light Rain\n---\nSunday Night:\nTemperature: 57°F\nWind: 6 mph SSW\nChance Light Rain\n---",
      },
    ],
  },
};

module.exports = {
  MOCK_TOOL_LIST,
  MOCK_FORECAST_RESPONSE,
};
