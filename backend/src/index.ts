import { createApp } from './app';
import { config } from './config';

const app = createApp();
app.listen(config.port, () => {
  console.log(`Hardware POS API listening on http://localhost:${config.port}`);
});
