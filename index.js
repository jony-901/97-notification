const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');

const token = '8928204066:AAE-R762UnOZnMDiTYCfZLuP_OHBFobC-mA';
const chatId = '7457103363';
const bot = new TelegramBot(token, { polling: true });

let isMonitoring = true;
let lastKnownPeriod = null;
let lastKnownNumber = null;
let globalPage = null; // Store page globally for screenshots

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    bot.sendMessage(chatId, '✅ Render.com সার্ভারে বট চালু হয়েছে!');
    monitorLottery();
});

const menuOptions = {
    reply_markup: JSON.stringify({
        keyboard: [
            [{ text: '🎲 লেটেস্ট নাম্বার' }, { text: '📸 স্ক্রিনশট দেখুন' }],
            [{ text: '🛑 মনিটরিং বন্ধ' }, { text: '▶️ মনিটরিং চালু' }]
        ],
        resize_keyboard: true
    })
};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "স্বাগতম! মেনু থেকে অপশন বেছে নিন:", menuOptions);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const id = msg.chat.id;

    if (text === '🎲 লেটেস্ট নাম্বার') {
        if (lastKnownPeriod) {
            bot.sendMessage(id, `সর্বশেষ ফলাফল:\nপিরিয়ড: \`${lastKnownPeriod}\`\nনাম্বার: **${lastKnownNumber}**`, { parseMode: 'Markdown' });
        } else {
            bot.sendMessage(id, 'এখনো কোনো ডেটা পাওয়া যায়নি। সার্ভার ব্লকড কিনা তা দেখতে "📸 স্ক্রিনশট দেখুন" বাটনে ক্লিক করুন।');
        }
    } 
    else if (text === '📸 স্ক্রিনশট দেখুন') {
        if (globalPage) {
            bot.sendMessage(id, '📸 স্ক্রিনশট নিচ্ছি, কয়েক সেকেন্ড অপেক্ষা করুন...');
            try {
                const path = 'screenshot.png';
                await globalPage.screenshot({ path: path, fullPage: false });
                await bot.sendPhoto(id, path);
            } catch (e) {
                bot.sendMessage(id, `স্ক্রিনশট নিতে সমস্যা হয়েছে: ${e.message}`);
            }
        } else {
            bot.sendMessage(id, 'ব্রাউজার এখনো চালু হয়নি।');
        }
    }
    else if (text === '🛑 মনিটরিং বন্ধ') {
        isMonitoring = false;
        bot.sendMessage(id, '❌ মনিটরিং বন্ধ করা হয়েছে।', menuOptions);
    } 
    else if (text === '▶️ মনিটরিং চালু') {
        isMonitoring = true;
        bot.sendMessage(id, '✅ মনিটরিং চালু করা হয়েছে!', menuOptions);
    }
});

function processNewData(period, number) {
    if (period && period !== lastKnownPeriod) {
        lastKnownPeriod = period;
        lastKnownNumber = number;
        
        console.log(`New Data: ${period} -> ${number}`);
        
        if (number === '6' || number === '8') {
            const msg = `🎉 **কাঙ্ক্ষিত নাম্বার পাওয়া গেছে!**\n\nনতুন নাম্বার এসেছে: **${number}**`;
            bot.sendMessage(chatId, msg, { parseMode: 'Markdown' });
        }
    }
}

async function monitorLottery() {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        
        globalPage = await browser.newPage();
        await globalPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        globalPage.on('response', async (response) => {
            if (response.url().includes('loadHistoryData')) {
                try {
                    const json = await response.json();
                    if (json && json.data && json.data.list && json.data.list.length > 0) {
                        let latest = json.data.list[0];
                        let period = latest.period || latest.issue;
                        let number = latest.number || latest.result;
                        if (period && number !== undefined) {
                            processNewData(period.toString(), number.toString());
                        }
                    }
                } catch(e) {}
            }
        });
        
        bot.sendMessage(chatId, '⏳ ওয়েবসাইটে প্রবেশ করছে...');
        await globalPage.goto('https://www.97lottery.com/#/pages/game/lottery/lottery?type=win', { waitUntil: 'networkidle2', timeout: 60000 });
        
        bot.sendMessage(chatId, '⏳ ডেটা পড়া শুরু হয়েছে! (৬ বা ৮ আসলে এলার্ট পাবেন)');
        
        setInterval(async () => {
            if (!isMonitoring) return;
            try {
                const result = await globalPage.evaluate(() => {
                    const bodyText = document.body.innerText;
                    const match = bodyText.match(/(202\d{10})[\s\n]+(\d)[\s\n]/);
                    if (match) return { period: match[1], number: match[2] };
                    return null;
                });
                if (result) processNewData(result.period, result.number);
            } catch (error) {}
        }, 5000);
        
    } catch (error) {
        bot.sendMessage(chatId, `❌ বটে একটি সমস্যা হয়েছে: ${error.message}`);
    }
}
