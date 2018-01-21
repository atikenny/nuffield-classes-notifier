const puppeteer = require('puppeteer');
const fs = require('fs');

const production = process.env.NODE_ENV === 'production';
const takeScreenshot = production;
const username = process.env.username;
const password = process.env.password;

if (!username || !password) {
    throw new Error('Please provide password as the first argument!');
}

const config = {
    screenshotsDir: 'screenshots',
    loginPage: 'https://member.nuffieldhealth.com/bookings/login.asp',
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
    const { screenshotsDir, loginPage, user, dev = false } = config;
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

    // LOGIN
    await login({
        page,
        navigateToPage,
        loginPage,
        loginPageSelectors: selectors.loginPage,
        user,
        finishedSelector: selectors.mainPage.classesButton
    });
    await log('logged in');

    // NAVIGATE TO CLASSES
    await navigateToClasses({
        page,
        mainPageSelectors: selectors.mainPage,
        finishedSelector: selectors.classesPage.classTitle
    });
    await log('navigated to classes');

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

async function login({
    page,
    navigateToPage,
    loginPage,
    loginPageSelectors,
    user,
    finishedSelector
}) {
    await navigateToPage(loginPage);
    await page.type(loginPageSelectors.username, user.name);
    await page.type(loginPageSelectors.password, user.password);

    return Promise.all([
        await page.click(loginPageSelectors.submitButton),
        await page.waitForSelector(finishedSelector)
    ]);
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

exports.handler = (event, context, callback) => {
    main(config, selectors, () => {
        callback(null, 'Finished collecting classes!');
    });
};
