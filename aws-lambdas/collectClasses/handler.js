const fs = require('fs');
const AWS = require('aws-sdk');

const fileService = require('./services/file-service.js');
const databaseService = require('./services/database-service.js');

const production = process.env.NODE_ENV === 'production';
const takeScreenshot = !production;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

if (!USERNAME || !PASSWORD) {
    throw new Error('Please provide password as the first argument!');
}

const config = {
    screenshotsDir: 'screenshots',
    loginPageUrl: 'https://member.nuffieldhealth.com/bookings/login.asp',
    classesPageUrl: 'https://member.nuffieldhealth.com/bookings/myspace/booking.asp',
    dev: !production
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

        if (data) {
            console.log(`Data: ${JSON.stringify(data)}`);
        }
    };
}

function getNavigator({ page, log }) {
    return async function navigateToPage(url) {
        try {
            await page.goto(url);
            await log(`navigated to ${url}`);
        } catch (error) {
            console.error(`Could not navigate to ${url}`);
            console.error(error);
        }
    };
}

async function main(browser, config, selectors) {
    const {
        screenshotsDir,
        loginPageUrl,
        classesPageUrl
    } = config;
    const page = await browser.newPage();
    const log = await getFlowLogger({
        screenshotsDir,
        page
    });
    const navigateToPage = getNavigator({ page, log });
    const decryptedPassword = await decryptPassword(PASSWORD);

    await initRequestInterceptor({ page });

    // LOAD COOKIES
    try {
        await loadCookies({ page });
        await log('loaded cookies');
    } catch (error) {
        await log(`Could not load cookies: ${error}`);
    }

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
            username: USERNAME,
            password: decryptedPassword,
            finishedSelector: selectors.mainPage.classesButton
        });
        await log('logged in');

        // SAVE COOKIES
        try {
            await saveCookies({ page });
            await log('saved cookies');
        } catch (error) {
            await log(`Could not save cookies: ${error}`);
        }

        // NAVIGATE TO CLASSES
        await navigateToPage(classesPageUrl);
        await log('navigated to classes');
    }

    // COLLECT CLASSES
    const classes = await collectClasses({
        page,
        classesPageSelectors: selectors.classesPage
    });
    await log('collected classes');

    try {
        await databaseService.putItems({
            TableName: 'nuffield-classes',
            Items: classes
        });
        await log('saved classes');
    } catch (error) {
        await log(`Could not save classes: ${error}`);
    }

    if (production) {
        await browser.close();
    }

    return classes;
}

async function decryptPassword(encryptedPassword) {
    const kms = new AWS.KMS();

    return new Promise((resolve, reject) => {
        kms.decrypt({
            CiphertextBlob: new Buffer(encryptedPassword, 'base64')
        }, (error, data) => {
            if (error) {
                reject(error);
            }

            resolve(data.Plaintext.toString('ascii'));
        });
    });
}

async function initRequestInterceptor({ page }) {
    await page.setRequestInterceptionEnabled(true);

    page.on('request', (request) => {
        if (request.resourceType.match(/image|stylesheet|media|font/)) {
            request.abort();
        } else {
            request.continue();
        }
    });
}

async function loadCookies({ page }) {
    const cookies = await getCookies();

    if (cookies) {
        const parsedCookies = JSON.parse(cookies);

        await page.setCookie(...parsedCookies);
    }
}

const getCookies = () => {
    return fileService.readFile({
        Bucket: 'atikenny-chrome',
        Key: 'collectClasses/cookies.json'
    });
};

async function login({
    page,
    navigateToPage,
    loginPageUrl,
    loginPageSelectors,
    username,
    password,
    finishedSelector
}) {
    await navigateToPage(loginPageUrl);
    await page.type(loginPageSelectors.username, username);
    await page.type(loginPageSelectors.password, password);

    return Promise.all([
        await page.click(loginPageSelectors.submitButton),
        await page.waitForSelector(finishedSelector)
    ]);
}

async function saveCookies({ page }) {
    const cookies = await page.cookies();
    const cookiesString = JSON.stringify(cookies);

    return fileService.writeFile({
        Bucket: 'atikenny-chrome',
        Key: 'collectClasses/cookies.json',
        Body: cookiesString
    });
}

async function collectClasses({ page, classesPageSelectors }) {
    return await page.evaluate((classItemSelectors) => {
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

const handler = (browser) => {
    return main(browser, config, selectors);
};

module.exports = handler;
