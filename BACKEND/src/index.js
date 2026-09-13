import "./config/env.js";
import connectDB from "./config/database.js";
import app from "./app.js";
import { telegramNotifier } from "./services/telegram.service.js";

const startServer = async () => {
  try {
    await connectDB();

    app.on("error", (err) => {
      console.error("Error starting the server:", err);
      throw err;
    });

    if (!telegramNotifier.isConfigured()) {
      console.log(
        "[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not configured — Telegram notifications are disabled."
      );
    }

    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });

  } catch (error) {
    console.log("Error starting the server:", error);
    process.exit(1);
  }
};
    startServer();