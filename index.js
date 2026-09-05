const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');
const http = require('http');

const token = '8928204066:AAE-R762UnOZnMDiTYCfZLuP_OHBFobC-mA';
const chatId = '7457103363';
const bot = new TelegramBot(token, { polling: true });

let isMonitoring = true;
let lastKnownPeriod = null;
let lastKnownNumber = null;
let globalPage = null;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    bot.sendMessage(chatId, '✅ Render.com সার্ভারে বট চালু হয়েছে!');
    monitorLottery();
});

const menuOptions = {
    reply_markup: JSON.stringify({
        keyboard: [
            [{ text: '🎲 লেটেস্ট নাম্বার' }, { text: '📸 স্ক্রিনশট দেখুন' }],
            [{ text: '🎮 Try Play (ডেমো)' }, { text: '▶️ গেম পেজে যান' }]
        ],
        resize_keyboard: true
    })
};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "স্বাগতম!\n\nলগইন না করে ডেমো দেখতে চাইলে '🎮 Try Play (ডেমো)' বাটনে ক্লিক করুন।", menuOptions);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const id = msg.chat.id;

    if (text === '🎲 লেটেস্ট নাম্বার') {
        if (lastKnownPeriod) {
            bot.sendMessage(id, `সর্বশেষ ফলাফল:\nপিরিয়ড: \`${lastKnownPeriod}\`\nনাম্বার: **${lastKnownNumber}**`, { parseMode: 'Markdown' });
        } else {
            bot.sendMessage(id, 'এখনো কোনো ডেটা পাওয়া যায়নি। স্ক্রিনশট চেক করুন।');
        }
    } 
    else if (text === '📸 স্ক্রিনশট দেখুন') {
        if (globalPage) {
            bot.sendMessage(id, '📸 স্ক্রিনশট নিচ্ছি, অপেক্ষা করুন...');
            try {
                const path = 'screenshot.png';
                await globalPage.screenshot({ path: path, fullPage: false });
                await bot.sendPhoto(id, path);
            } catch (e) {
                bot.sendMessage(id, `স্ক্রিনশট নিতে সমস্যা: ${e.message}`);
            }
        }
    }
    else if (text === '🎮 Try Play (ডেমো)') {
        if (globalPage) {
            bot.sendMessage(id, 'Try Play বাটনে ক্লিক করার চেষ্টা করছি...');
            try {
                await globalPage.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('*'));
                    const tryPlayBtn = elements.find(el => el.innerText && el.innerText.toLowerCase().includes('try play'));
                    if (tryPlayBtn) tryPlayBtn.click();
                    else {
                        const demoBtn = elements.find(el => el.innerText && (el.innerText.toLowerCase().includes('demo') || el.innerText.toLowerCase().includes('guest')));
                        if (demoBtn) demoBtn.click();
                    }
                });
                await new Promise(r => setTimeout(r, 4000));
                bot.sendMessage(id, 'ক্লিক করা হয়েছে! এখন "▶️ গেম পেজে যান" বাটনে ক্লিক করুন।');
            } catch (e) {
                bot.sendMessage(id, `Error: ${e.message}`);
            }
        }
    }
    else if (text === '▶️ গেম পেজে যান') {
        if (globalPage) {
            bot.sendMessage(id, 'গেমের পেজে রিডাইরেক্ট করা হচ্ছে...');
            try {
                await globalPage.goto('https://www.97lottery.com/#/pages/game/lottery/lottery?type=win', { waitUntil: 'networkidle2', timeout: 60000 });
                bot.sendMessage(id, 'গেম পেজে চলে এসেছে! স্ক্রিনশট নিয়ে চেক করুন।');
            } catch (e) {
                bot.sendMessage(id, `Error: ${e.message}`);
            }
        }
    }
});

// Login code via command remains just in case
bot.onText(/\/login (.+) (.+)/, async (msg, match) => { /* keeping this out to save space since we added Try Play */ });

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
        await globalPage.setViewport({ width: 375, height: 812 });
        await globalPage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1');
        
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
        
        await globalPage.goto('https://www.97lottery.com/#/pages/game/lottery/lottery?type=win', { waitUntil: 'networkidle2', timeout: 60000 });
        
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
        
    } catch (error) {}
}
