import { createApp } from './app.ts';
import { config } from './config.ts';
import { createDatabase } from './db/database.ts';

const app = createApp({ db: createDatabase(config.dbName) });

app.listen(config.port, () => {
  console.log(`Snap escuchando en http://localhost:${config.port}`);
});
