import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'chatbot-components',
              test: /node_modules[\\/]@patternfly[\\/]chatbot/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'chatbot-markdown',
              test: /node_modules[\\/](react-markdown|remark-|rehype-|unified|micromark|hast-util|mdast-util|unist-util|highlight\.js)/,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
