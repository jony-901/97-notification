const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
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
server.listen(process.env.PORT || 3000, () => {
    bot.sendMessage(chatId, '✅ Render সার্ভারে বট চালু হয়েছে!');
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
    bot.sendMessage(msg.chat.id, "স্বাগতম!\n\nলগইন করতে নিচের মতো মেসেজ দিন:\n`/login আপনার_নাম্বার আপনার_পাসওয়ার্ড`", Object.assign({ parseMode: 'Markdown' }, menuOptions));
});

bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    const id = msg.chat.id;
    const phone = match[1];
    const password = match[2];

    if (!globalPage) return bot.sendMessage(id, 'ব্রাউজার এখনো চালু হয়নি, একটু পর চেষ্টা করুন।');

    bot.sendMessage(id, `লগইন করার চেষ্টা করা হচ্ছে...`);
    try {
        await globalPage.waitForSelector('input', { timeout: 15000 }).catch(() => {});
        const inputs = await globalPage.$$('input');
        if (inputs.length >= 2) {
            await inputs[0].click({ clickCount: 3 });
            await globalPage.keyboard.press('Backspace');
            await inputs[0].type(phone, { delay: 100 });
            
            await inputs[1].click({ clickCount: 3 });
            await globalPage.keyboard.press('Backspace');
            await inputs[1].type(password, { delay: 100 });

            bot.sendMessage(id, 'লগইন বাটনে ক্লিক করছি...');
            await globalPage.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, div, span, a'));
                const loginBtn = buttons.find(b => b.innerText && b.innerText.trim().toLowerCase() === 'log in');
                if (loginBtn) loginBtn.click();
                else {
                    const allBtns = document.querySelectorAll('button');
                    if (allBtns.length > 0) allBtns[0].click();
                }
            });
            await new Promise(r => setTimeout(r, 8000));
            bot.sendMessage(id, 'লগইন প্রসেস শেষ হয়েছে। "📸 স্ক্রিনশট দেখুন" বাটনে ক্লিক করে চেক করুন।');
            await globalPage.goto('https://www.97lottery.com/#/pages/game/lottery/lottery?type=win', { waitUntil: 'domcontentloaded', timeout: 60000 });
        } else {
            bot.sendMessage(id, 'লগইন ফর্ম পাওয়া যায়নি। ওয়েবসাইট হয়তো পুরোপুরি লোড হয়নি। স্ক্রিনশট চেক করুন।');
        }
    } catch (e) {
        bot.sendMessage(id, `লগইন এরর: ${e.message}`);
    }
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const id = msg.chat.id;

    if (text === '🎲 লেটেস্ট নাম্বার') {
        if (lastKnownPeriod) {
            bot.sendMessage(id, `সর্বশেষ ফলাফল:\nপিরিয়ড: \`${lastKnownPeriod}\`\nনাম্বার: **${lastKnownNumber}**`, { parseMode: 'Markdown' });
        } else {
            bot.sendMessage(id, 'এখনো কোনো ডেটা পাওয়া যায়নি।');
        }
    } 
    else if (text === '📸 স্ক্রিনশট দেখুন') {
        if (globalPage) {
            bot.sendMessage(id, '📸 স্ক্রিনশট নিচ্ছি, অপেক্ষা করুন...');
            try {
                const title = await globalPage.title();
                const path = 'screenshot.png';
                await globalPage.screenshot({ path: path, fullPage: false });
                await bot.sendPhoto(id, path, { caption: `Page Title: ${title}` });
            } catch (e) {
                bot.sendMessage(id, `স্ক্রিনশট এরর: ${e.message}`);
            }
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
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=400,850'
            ]
        });
        globalPage = await browser.newPage();
        await globalPage.setViewport({ width: 375, height: 812 });
        await globalPage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
        
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
        
        await globalPage.goto('https://www.97lottery.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));
        await globalPage.goto('https://www.97lottery.com/#/pages/game/lottery/lottery?type=win', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
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
