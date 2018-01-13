const puppeteer = require('puppeteer');
const config = {
    screenshotsDir: 'screenshots',
    loginPage: 'https://member.nuffieldhealth.com/bookings/login.asp'
};

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(config.loginPage);
    await page.screenshot({
        path: `${config.screenshotsDir}/login.png`
    });

    await browser.close();
})();
