import puppeteer from 'puppeteer';
import fs from 'fs';

const production = process.env.NODE_ENV === 'production';
const takeScreenshot = production;
const username = process.env.username;
const password = process.env.password;

if (!username || !password) {
    throw new Error('Please provide password as the first argument!');
}

const config = {
    screenshotsDir: 'screenshots',
    loginPageUrl: 'https://member.nuffieldhealth.com/bookings/login.asp',
    classesPageUrl: 'https://member.nuffieldhealth.com/bookings/myspace/booking.asp',
    dev: !production,
    user: {
        name: username,
        password
    }
};

const selectors = {
    loginPage: {
        username: '[name=emailaddress]',
        password: '[name=password]',
        submitButton: '#loginButton'
    },
    mainPage: {
        classesButton: '#mnu_classes'
    },
    classesPage: {
        classTitle: '.day-spacer',
        classItem: {
            container: '.act',
            name: '.act_Ttl',
            date: '.act_DT',
            status: '.act_StatusTxt',
            fullClass: 'act_full'
        }
    }
};

async function getFlowLogger({ screenshotsDir, page, fullPage = true }) {
    let step = 0;
    const flowId = Date.now();
    const flowScreenshotsDir = `./${screenshotsDir}/${flowId}`;

    if (takeScreenshot && !(await fs.exists(flowScreenshotsDir))) {
        fs.mkdir(flowScreenshotsDir);
    }

    return async function log(stepDescription, data) {
        console.log(`Step ${++step}: `, stepDescription);

        if (takeScreenshot) {
            await page.screenshot({
                path: `${flowScreenshotsDir}/step-${step}.png`,
                fullPage
            });
        }

        if (!production && data) {
            console.log(`Data: ${JSON.stringify(data)}`);
        }
    };
}

function getNavigator({ page, log }) {
    return async function navigateToPage(url) {
        await page.goto(url);
        await log(`navigated to ${url}`);
    }
}

async function main(config, selectors, callback) {
    const {
        screenshotsDir,
        loginPageUrl,
        classesPageUrl,
        user,
        dev = false
    } = config;
    const browserConfig = {
        headless: !dev,
        slowMo: dev ? 100 : 0
    };
    const browser = await puppeteer.launch(browserConfig);
    const page = await browser.newPage();
    const log = await getFlowLogger({
        screenshotsDir,
        page
    });
    const navigateToPage = getNavigator({ page, log });

    // LOAD COOKIES
    await loadCookies({ page });
    await log('loaded cookies');

    // GOTO CLASSES
    await navigateToPage(classesPageUrl);
    const url = await page.url();
    
    // IF NOT LOGGED IN DO THE LOGIN
    if (url !== classesPageUrl) {
        await log('Not logged in yet, navigating to login page!');

        // LOGIN
        await login({
            page,
            navigateToPage,
            loginPageUrl,
            loginPageSelectors: selectors.loginPage,
            user,
            finishedSelector: selectors.mainPage.classesButton
        });
        await log('logged in');

        // SAVE COOKIES
        await saveCookies({ page });
        await log('saved cookies');

        // NAVIGATE TO CLASSES
        await navigateToClasses({
            page,
            mainPageSelectors: selectors.mainPage,
            finishedSelector: selectors.classesPage.classTitle
        });
        await log('navigated to classes');
    }

    // COLLECT CLASSES
    const classes = await collectClasses({
        page,
        classesPageSelectors: selectors.classesPage
    });
    await log('collected classes', classes);

    if (production) {
        await browser.close();
    }

    callback();
}

async function loadCookies({ page }) {
    const cookies = getCookies();

    if (cookies) {
        await page.setCookie(...cookies);
    }
}

const getCookies = () => {
    try {
        return require('./data/cookies.json');
    } catch(error) {
        console.warn(error);
        console.warn('Could not load cookies!');

        return;
    }
};

async function login({
    page,
    navigateToPage,
    loginPageUrl,
    loginPageSelectors,
    user,
    finishedSelector
}) {
    await navigateToPage(loginPageUrl);
    await page.type(loginPageSelectors.username, user.name);
    await page.type(loginPageSelectors.password, user.password);

    return Promise.all([
        await page.click(loginPageSelectors.submitButton),
        await page.waitForSelector(finishedSelector)
    ]);
}

async function saveCookies({ page }) {
    const cookies = await page.cookies();
    
    await fs.writeFile('./src/data/cookies.json', JSON.stringify(cookies), (error) => {
        if (error) {
            console.warn(error);
            console.warn('Could not save cookies!');
        }
    });
}

async function navigateToClasses({ page, mainPageSelectors, finishedSelector }) {
    await Promise.all([
        await page.click(mainPageSelectors.classesButton),
        await page.waitForSelector(finishedSelector)
    ]);
}

async function collectClasses({ page, classesPageSelectors }) {
    return await page.evaluate(classItemSelectors => {
        const classItemNodes = document.querySelectorAll(classItemSelectors.container);
        const classItems = Array.from(classItemNodes);
        const getFreePlaces = (status) => {
            return Number(status.replace('There are ', '').replace(' places left in this class', ''));
        };
        const getId = (name, day, time) => {
            return `${day}-${time}-${name}`
                .toLowerCase()
                .replace(':', '-')
                .replace(' ', '_');
        };

        return classItems.map((item, index) => {
            const classItemNode = classItemNodes[index];
            const nameNode = classItemNode.querySelector(classItemSelectors.name);
            const name = nameNode.textContent;
            const dateNode = classItemNode.querySelector(classItemSelectors.date);
            const date = dateNode.textContent.trim();
            const day = date.split('    ')[0];
            const time = date.split('    ')[1];
            const isFull = classItemNode.classList.contains(classItemSelectors.fullClass);
            const statusNode = classItemNode.querySelector(classItemSelectors.status);
            const status = statusNode.textContent;
            const freePlaces = isFull ? undefined : getFreePlaces(status);
            const id = getId(name, day, time);

            return {
                id,
                name,
                date,
                day,
                time,
                isFull,
                status,
                freePlaces
            };
        });
    }, classesPageSelectors.classItem);
}

const handler = (callback) => {
    main(config, selectors, callback);
};

export default handler;
