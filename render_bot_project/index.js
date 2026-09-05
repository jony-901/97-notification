const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');
const http = require('http');

const token = '8928204066:AAE-R762UnOZnMDiTYCfZLuP_OHBFobC-mA';
const chatId = '7457103363';
const bot = new TelegramBot(token, { polling: true });

let isMonitoring = true;
let lastKnownPeriod = null;
let lastKnownNumber = null;

// Render Web Service requires binding to a port
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running on Render!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    bot.sendMessage(chatId, '✅ Render.com সার্ভারে বট সফলভাবে চালু হয়েছে!');
    monitorLottery();
});

const menuOptions = {
    reply_markup: JSON.stringify({
        keyboard: [
            [{ text: '🎲 লেটেস্ট নাম্বার' }, { text: '📊 বটের অবস্থা' }],
            [{ text: '🛑 মনিটরিং বন্ধ করুন' }, { text: '▶️ মনিটরিং চালু করুন' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    })
};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "স্বাগতম 97 Tung Tunk বটে!\nনিচের মেনু থেকে অপশন বেছে নিন:", menuOptions);
});

bot.on('message', (msg) => {
    const text = msg.text;
    const id = msg.chat.id;

    if (text === '🎲 লেটেস্ট নাম্বার') {
        if (lastKnownPeriod) {
            bot.sendMessage(id, `সর্বশেষ ফলাফল:\nপিরিয়ড: \`${lastKnownPeriod}\`\nনাম্বার: **${lastKnownNumber}**`, { parseMode: 'Markdown' });
        } else {
            bot.sendMessage(id, 'এখনো ওয়েবসাইট লোড হচ্ছে। একটু অপেক্ষা করুন...');
        }
    } 
    else if (text === '📊 বটের অবস্থা') {
        bot.sendMessage(id, `বট বর্তমানে **${isMonitoring ? 'চালু (চলছে)' : 'বন্ধ (স্টপ)'}** অবস্থায় আছে।`, { parseMode: 'Markdown' });
    } 
    else if (text === '🛑 মনিটরিং বন্ধ করুন') {
        isMonitoring = false;
        bot.sendMessage(id, '❌ বটের লাইভ মনিটরিং বন্ধ করা হয়েছে।', menuOptions);
    } 
    else if (text === '▶️ মনিটরিং চালু করুন') {
        isMonitoring = true;
        bot.sendMessage(id, '✅ বটের লাইভ মনিটরিং আবার চালু করা হয়েছে!', menuOptions);
    }
});

async function monitorLottery() {
    let browser;
    try {
        console.log('ব্রাউজার চালু হচ্ছে...');
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ]
        });
        
        const page = await browser.newPage();
        
        bot.sendMessage(chatId, '⏳ ওয়েবসাইটে প্রবেশ করছে...');
        await page.goto('https://www.97lottery.com/#/pages/game/lottery/lottery?type=win', { waitUntil: 'networkidle2', timeout: 60000 });
        
        console.log('ওয়েবসাইট লোড হয়েছে। ২০ সেকেন্ড অপেক্ষা করছি...');
        await new Promise(r => setTimeout(r, 20000));
        bot.sendMessage(chatId, '⏳ ডেটা পড়া শুরু হয়েছে! (৬ বা ৮ আসলে এলার্ট পাবেন)');
        
        setInterval(async () => {
            if (!isMonitoring) return;

            try {
                const result = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('*'));
                    const regex = /^202\d{10}$/;
                    for (let el of elements) {
                        const text = el.innerText ? el.innerText.trim() : '';
                        if (regex.test(text)) {
                            const rowText = el.parentElement ? el.parentElement.innerText : '';
                            const parts = rowText.split('\n');
                            if (parts.length >= 2) {
                                return {
                                    period: text,
                                    number: parts[1].trim()
                                };
                            }
                        }
                    }
                    return null;
                });
                
                if (result && result.period !== lastKnownPeriod) {
                    if (result.number === '6' || result.number === '8') {
                        const msg = `🎉 **কাঙ্ক্ষিত নাম্বার পাওয়া গেছে!**\n\nপিরিয়ড: \`${result.period}\`\nনাম্বার: **${result.number}**`;
                        bot.sendMessage(chatId, msg, { parseMode: 'Markdown' });
                    }
                    lastKnownPeriod = result.period;
                    lastKnownNumber = result.number;
                }
            } catch (error) {
                console.log('পেজ স্ক্যানিং ত্রুটি:', error.message);
            }
        }, 5000);
        
    } catch (error) {
        console.error('ব্রাউজার চালু করতে সমস্যা:', error);
        bot.sendMessage(chatId, `❌ বটে একটি সমস্যা হয়েছে: ${error.message}`);
    }
}
