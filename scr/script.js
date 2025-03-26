// ==UserScript==
// @name         Speech Assistant Isolated
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Изолированный голосовой помощник с распознаванием и синтезом речи
// @author       Palkin Denys
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      google.com
// @connect      api.openai.com
// @connect      speech.googleapis.com
// @connect      generativelanguage.googleapis.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        window.myPolicy = window.trustedTypes.createPolicy('myPolicy', {
            createHTML: (string) => DOMPurify.sanitize(string),
            createScript: (string) => string,
            createScriptURL: (string) => string
        });
    }

    //В функции safeHTML в блоке else, там, где Резервный вариант (без Trusted Types)
    //Вместо element.innerHTML = htmlString;
    //надо element.innerHTML = DOMPurify.sanitize(htmlString); // и для outerHTML, insertAdjacentHTML так же
    function safeHTML(element, method, htmlString) {
        if (window.myPolicy) {
            switch (method) {
                case 'innerHTML':
                    element.innerHTML = window.myPolicy.createHTML(htmlString);
                    break;
                case 'outerHTML':
                    element.outerHTML = window.myPolicy.createHTML(htmlString);
                    break;
                case 'insertAdjacentHTML':
                    // insertAdjacentHTML требует два аргумента: позицию и строку
                    if (arguments.length === 4) {
                        // Проверяем, что позиция передана
                        element.insertAdjacentHTML(arguments[2], window.myPolicy.createHTML(arguments[3]));
                    } else {
                        console.error('safeHTML: insertAdjacentHTML requires a position argument.');
                    }
                    break;
                case 'textContent': // Добавляем поддержку textContent
                    element.textContent = htmlString; // textContent не требует Trusted Types
                    break;

                    // Добавьте другие методы по мере необходимости (e.g., append, prepend)
                default:
                    console.error('safeHTML: Unsupported method:', method);
            }
        } else {
            // Резервный вариант (без Trusted Types)
            // ВАЖНО: Здесь тоже нужна санитация! Используем DOMPurify.
            switch (method) {
                case 'innerHTML':
                    element.innerHTML = DOMPurify.sanitize(htmlString);
                    break;
                case 'outerHTML':
                    element.outerHTML = DOMPurify.sanitize(htmlString);
                    break;
                case 'insertAdjacentHTML':
                    if (arguments.length === 4) {
                        element.insertAdjacentHTML(arguments[2], DOMPurify.sanitize(arguments[3]));
                    }
                    break;
                case 'textContent':
                    element.textContent = htmlString;
                    break;
                default:
                    console.error('safeHTML: Unsupported method:', method);
            }
        }
    }

    // Глобальная очередь обработанных команд
    let processedCommands = [];

    // Время (мс), в течение которого команда сохраняется в очереди
    const COMMAND_EXPIRATION_TIME = 5000;

    // Функция для регистрации обработанной команды
    function registerProcessedCommand(command, replacement) {
        processedCommands.push({
            command: command, // Исходный текст команды
            replacement: replacement, // Чем заменить
            timestamp: Date.now() // Время регистрации
        });
        cleanupExpiredCommands();
    }

    // Функция для очистки устаревших команд
    function cleanupExpiredCommands() {
        const now = Date.now();
        processedCommands = processedCommands.filter(cmd =>
            (now - cmd.timestamp) < COMMAND_EXPIRATION_TIME
        );
    }

    // Функция для очистки текста от команд
    function cleanTextFromCommands(text) {
        if (!text || processedCommands.length === 0) {
            return text;
        }

        cleanupExpiredCommands();

        for (const cmd of processedCommands) {
            if (text === cmd.command) {
                return cmd.replacement;
            }

            if (text.includes(cmd.command)) {
                return text.replace(cmd.command, cmd.replacement);
            }
        }

        return text;
    }

    // Генерируем уникальный идентификатор для изоляции стилей
    const PREFIX = `speech_assist_${Math.random().toString(36).substring(2, 10)}_`;

    // Локализация интерфейса
    const translations = {
        'ru-RU': {
            title: 'Распознавание речи',
            settings: 'Настройки',
            notepadTab: 'Блокнот',
            savedTab: 'Сохраненные тексты',
            billingTab: 'Статистика API',
            startRecording: 'Старт записи',
            stopRecording: 'Остановить запись',
            copyText: 'Копировать текст',
            clearNotepad: 'Очистить блокнот',
            copied: 'Скопировано!',
            browserAPI: 'Запись через браузерное API',
            googleAPI: 'Запись через Google API',
            noSavedTexts: 'Нет сохраненных текстов',
            recordFrom: 'Запись от',
            delete: 'Удалить',
            close: 'Закрыть',
            clearMemory: 'Очистить память',
            read: 'Прочесть',
            pause: 'Пауза',
            continue: 'Продолжить',
            stop: 'Стоп',
            save: 'Сохранить',
            cancel: 'Отмена',
            settingsTitle: 'Настройки',
            googleKey: 'Google Speech API Key',
            openaiKey: 'OpenAI API Key',
            language: 'Язык распознавания',
            sites: 'Сайты для TTS (через запятую)',
            voice: 'Голос OpenAI TTS',
            model: 'Модель OpenAI TTS',
            fontSettings: 'Настройки шрифта',
            font: 'Шрифт',
            fontSize: 'Размер шрифта',
            fontWeight: 'Толщина шрифта',
            lineHeight: 'Высота строки (px)',
            recordingStyle: 'Стиль распознавания',
            byWord: 'По словам',
            byPhrase: 'По фразам',
            billingStats: 'Статистика использования',
            openaiTokens: 'Токены OpenAI',
            googleMinutes: 'Минуты Google Speech',
            totalTokens: 'Всего токенов:',
            inTokens: 'Входящие:',
            outTokens: 'Исходящие:',
            totalMinutes: 'Всего минут:',
            resetBilling: 'Сбросить статистику',
            fontNormal: 'Обычный',
            fontMedium: 'Средний',
            fontSemiBold: 'Полужирный',
            fontBold: 'Жирный',
            noMicAccess: 'Не удалось получить доступ к микрофону',
            errorAudioInit: 'Не удалось инициализировать аудио. Используйте Chrome для лучшей поддержки.',
            noKeySpecified: 'Пожалуйста, укажите API ключ {0} в настройках',
            errorTTS: 'Ошибка при генерации речи. Проверьте консоль для подробностей.',
            errorPlayAudio: 'Не удалось воспроизвести аудио. Проверьте настройки браузера.',
            sendToAI: 'Отправить в AI',
            processing: 'Обработка...',
            selectAIProvider: 'Выберите AI провайдер',
            useGemini: 'Использовать Google Gemini',
            useGPT: 'Использовать GPT',
            cancel: 'Отмена',
            noApiKey: 'Не указан API ключ для {0}. Пожалуйста, добавьте его в настройках.',
            processingError: 'Ошибка при обработке: {0}',
            aiSettings: 'Настройки AI обработки',
            geminiKey: 'Google Gemini API Key',
            geminiUrl: 'URL API Gemini',
            gptKey: 'GPT API Key',
            gptUrl: 'URL API GPT',
            systemPrompt: 'Системный промпт',
            mainPrompt: 'Основной промпт',
            historyCount: 'Количество сообщений из истории',
            aiTab: 'AI обработка',
            clearAI: 'Очистить результат',
            forceAPI: 'Принудительное использование API',
            aiSettingsTitle: 'Настройки обработки текста',
            openAISettings: 'Настройки AI обработки',
            aiSettingsSaved: 'Настройки AI сохранены',
            settingsSaved: 'Настройки сохранены',
            noTextToProcess: 'Нет текста для обработки',
            temperature: 'Температура (0-2)',
            maxTokens: 'Максимум токенов',
            gptModel: 'Модель GPT',
            geminiModel: 'Модель Gemini',
            defaultAIProvider: 'AI провайдер по умолчанию',
            geminiSettings: 'Настройки Google Gemini',
            gptSettings: 'Настройки OpenAI GPT',
            commonSettings: 'Общие настройки запросов',
            contentBlocked: 'Контент заблокирован: {0}',
            apiError: 'Ошибка API: {0}',
            pauseRecording: 'Пауза',
            continueRecording: 'Продолжить',
            webAPI: 'Web API',
            cloudAPI: 'Cloud API',
            'gptTokens': 'Токены GPT',
            'geminiTokens': 'Токены Gemini',
            'aiTokensUsage': 'Использование AI токенов',
            'customCommands': 'Пользовательские команды',
            'addCommand': 'Добавить команду',
            'command': 'Команда',
            'action': 'Действие',
            'add': 'Добавить',
            'confirmDeleteCommand': 'Вы уверены, что хотите удалить эту команду?',
            'enterCommandText': 'Введите текст команды',
            'enterCommandError': 'Пожалуйста, введите текст команды',
            'customCommandsSaved': 'Пользовательские команды сохранены',
            'clearCommand': 'Очистить',
            'copyCommand': 'Копировать',
            'saveCommand': 'Сохранить',
            'stopCommand': 'Остановить',
            'pauseCommand': 'Пауза',
            'processCommand': 'Обработать',
            'periodCommand': 'Точка',
            'commaCommand': 'Запятая',
            'questionCommand': 'Вопросительный знак',
            'exclamationCommand': 'Восклицательный знак',
            'newLineCommand': 'Новая строка',
            'capitalizeCommand': 'С большой буквы',
            'colonCommand': 'Двоеточие',
            'instructionsTab': 'Инструкции',
        },
        'en-US': {
            title: 'Speech Recognition',
            settings: 'Settings',
            notepadTab: 'Notepad',
            savedTab: 'Saved Texts',
            billingTab: 'API Statistics',
            startRecording: 'Start Recording',
            stopRecording: 'Stop Recording',
            copyText: 'Copy Text',
            clearNotepad: 'Clear Notepad',
            copied: 'Copied!',
            browserAPI: 'Recording via Browser API',
            googleAPI: 'Recording via Google API',
            noSavedTexts: 'No saved texts',
            recordFrom: 'Recording from',
            delete: 'Delete',
            close: 'Close',
            clearMemory: 'Clear Memory',
            read: 'Read',
            pause: 'Pause',
            continue: 'Continue',
            stop: 'Stop',
            save: 'Save',
            cancel: 'Cancel',
            settingsTitle: 'Settings',
            googleKey: 'Google Speech API Key',
            openaiKey: 'OpenAI API Key',
            language: 'Recognition Language',
            sites: 'Sites for TTS (comma separated)',
            voice: 'OpenAI TTS Voice',
            model: 'OpenAI TTS Model',
            fontSettings: 'Font Settings',
            font: 'Font',
            fontSize: 'Font Size',
            fontWeight: 'Font Weight',
            lineHeight: 'Line Height (px)',
            recordingStyle: 'Recognition Style',
            byWord: 'By Word',
            byPhrase: 'By Phrase',
            billingStats: 'Usage Statistics',
            openaiTokens: 'OpenAI Tokens',
            googleMinutes: 'Google Speech Minutes',
            totalTokens: 'Total tokens:',
            inTokens: 'Input:',
            outTokens: 'Output:',
            totalMinutes: 'Total minutes:',
            resetBilling: 'Reset Statistics',
            fontNormal: 'Normal',
            fontMedium: 'Medium',
            fontSemiBold: 'Semi Bold',
            fontBold: 'Bold',
            noMicAccess: 'Failed to access microphone',
            errorAudioInit: 'Failed to initialize audio. Use Chrome for better support.',
            noKeySpecified: 'Please specify {0} API key in settings',
            errorTTS: 'Error generating speech. Check console for details.',
            errorPlayAudio: 'Failed to play audio. Check browser settings.',
            sendToAI: 'Send to AI',
            processing: 'Processing...',
            selectAIProvider: 'Select AI provider',
            useGemini: 'Use Google Gemini',
            useGPT: 'Use GPT',
            cancel: 'Cancel',
            noApiKey: 'No API key specified for {0}. Please add it in settings.',
            processingError: 'Processing error: {0}',
            aiSettings: 'AI Processing Settings',
            geminiKey: 'Google Gemini API Key',
            geminiUrl: 'Gemini API URL',
            gptKey: 'GPT API Key',
            gptUrl: 'GPT API URL',
            systemPrompt: 'System Prompt',
            mainPrompt: 'Main Prompt',
            historyCount: 'Number of messages from history',
            aiTab: 'AI Processing',
            clearAI: 'Clear Result',
            forceAPI: 'Force API Usage',
            aiSettingsTitle: 'Text Processing Settings',
            openAISettings: 'AI Processing Settings',
            aiSettingsSaved: 'AI Settings Saved',
            settingsSaved: 'Settings Saved',
            noTextToProcess: 'No text to process',
            temperature: 'Temperature (0-2)',
            maxTokens: 'Maximum Tokens',
            gptModel: 'GPT Model',
            geminiModel: 'Gemini Model',
            defaultAIProvider: 'Default AI Provider',
            geminiSettings: 'Google Gemini Settings',
            gptSettings: 'OpenAI GPT Settings',
            commonSettings: 'Common Request Settings',
            contentBlocked: 'Content blocked: {0}',
            apiError: 'API Error: {0}',
            pauseRecording: 'Pause',
            continueRecording: 'Continue',
            webAPI: 'Web API',
            cloudAPI: 'Cloud API',
            'gptTokens': 'GPT Tokens',
            'geminiTokens': 'Gemini Tokens',
            'aiTokensUsage': 'AI Tokens Usage',
            'customCommands': 'Custom Commands',
            'addCommand': 'Add Command',
            'command': 'Command',
            'action': 'Action',
            'add': 'Add',
            'confirmDeleteCommand': 'Are you sure you want to delete this command?',
            'enterCommandText': 'Enter command text',
            'enterCommandError': 'Please enter command text',
            'customCommandsSaved': 'Custom commands saved',
            'clearCommand': 'Clear',
            'copyCommand': 'Copy',
            'saveCommand': 'Save',
            'stopCommand': 'Stop',
            'pauseCommand': 'Pause',
            'processCommand': 'Process',
            'periodCommand': 'Period',
            'commaCommand': 'Comma',
            'questionCommand': 'Question mark',
            'exclamationCommand': 'Exclamation mark',
            'newLineCommand': 'New line',
            'capitalizeCommand': 'Capitalize',
            'colonCommand': 'Colon',
            'instructionsTab': 'Instructions',
        },
        'uk-UA': {
            title: 'Розпізнавання мовлення',
            settings: 'Налаштування',
            notepadTab: 'Блокнот',
            savedTab: 'Збережені тексти',
            billingTab: 'Статистика API',
            startRecording: 'Почати запис',
            stopRecording: 'Зупинити запис',
            copyText: 'Копіювати текст',
            clearNotepad: 'Очистити блокнот',
            copied: 'Скопійовано!',
            browserAPI: 'Запис через браузерне API',
            googleAPI: 'Запис через Google API',
            noSavedTexts: 'Немає збережених текстів',
            recordFrom: 'Запис від',
            delete: 'Видалити',
            close: 'Закрити',
            clearMemory: 'Очистити пам`ять',
            read: 'Прочитати',
            pause: 'Пауза',
            continue: 'Продовжити',
            stop: 'Стоп',
            save: 'Зберегти',
            cancel: 'Скасувати',
            settingsTitle: 'Налаштування',
            googleKey: 'Google Speech API Ключ',
            openaiKey: 'OpenAI API Ключ',
            language: 'Мова розпізнавання',
            sites: 'Сайти для TTS (через кому)',
            voice: 'Голос OpenAI TTS',
            model: 'Модель OpenAI TTS',
            fontSettings: 'Налаштування шрифту',
            font: 'Шрифт',
            fontSize: 'Розмір шрифту',
            fontWeight: 'Товщина шрифту',
            lineHeight: 'Висота рядка (px)',
            recordingStyle: 'Стиль розпізнавання',
            byWord: 'По словах',
            byPhrase: 'По фразах',
            billingStats: 'Статистика використання',
            openaiTokens: 'Токени OpenAI',
            googleMinutes: 'Хвилини Google Speech',
            totalTokens: 'Всього токенів:',
            inTokens: 'Вхідні:',
            outTokens: 'Вихідні:',
            totalMinutes: 'Всього хвилин:',
            resetBilling: 'Скинути статистику',
            fontNormal: 'Звичайний',
            fontMedium: 'Середній',
            fontSemiBold: 'Напівжирний',
            fontBold: 'Жирний',
            noMicAccess: 'Не вдалося отримати доступ до мікрофона',
            errorAudioInit: 'Не вдалося ініціалізувати аудіо. Використовуйте Chrome для кращої підтримки.',
            noKeySpecified: 'Будь ласка, вкажіть API ключ {0} в налаштуваннях',
            errorTTS: 'Помилка при генерації мовлення. Перевірте консоль для деталей.',
            errorPlayAudio: 'Не вдалося відтворити аудіо. Перевірте налаштування браузера.',
            sendToAI: 'Надіслати в AI',
            processing: 'Обробка...',
            selectAIProvider: 'Виберіть AI провайдер',
            useGemini: 'Використовувати Google Gemini',
            useGPT: 'Використовувати GPT',
            cancel: 'Скасувати',
            noApiKey: 'Не вказаний API ключ для {0}. Будь ласка, додайте його в налаштуваннях.',
            processingError: 'Помилка при обробці: {0}',
            aiSettings: 'Налаштування AI обробки',
            geminiKey: 'Google Gemini API Ключ',
            geminiUrl: 'URL API Gemini',
            gptKey: 'GPT API Ключ',
            gptUrl: 'URL API GPT',
            systemPrompt: 'Системний промпт',
            mainPrompt: 'Основний промпт',
            historyCount: 'Кількість повідомлень з історії',
            aiTab: 'AI обробка',
            clearAI: 'Очистити результат',
            forceAPI: 'Примусове використання API',
            aiSettingsTitle: 'Налаштування обробки тексту',
            openAISettings: 'Налаштування AI обробки',
            aiSettingsSaved: 'Налаштування AI збережено',
            settingsSaved: 'Налаштування збережено',
            noTextToProcess: 'Немає тексту для обробки',
            temperature: 'Температура (0-2)',
            maxTokens: 'Максимум токенів',
            gptModel: 'Модель GPT',
            geminiModel: 'Модель Gemini',
            defaultAIProvider: 'AI провайдер за замовчуванням',
            geminiSettings: 'Налаштування Google Gemini',
            gptSettings: 'Налаштування OpenAI GPT',
            commonSettings: 'Загальні налаштування запитів',
            contentBlocked: 'Контент заблоковано: {0}',
            apiError: 'Помилка API: {0}',
            pauseRecording: 'Пауза',
            continueRecording: 'Продовжити',
            webAPI: 'Web API',
            cloudAPI: 'Cloud API',
            'gptTokens': 'Токени GPT',
            'geminiTokens': 'Токени Gemini',
            'aiTokensUsage': 'Використання AI токенів',
            'customCommands': 'Vlastní příkazy',
            'addCommand': 'Přidat příkaz',
            'command': 'Příkaz',
            'action': 'Akce',
            'add': 'Přidat',
            'confirmDeleteCommand': 'Jste si jisti, že chcete smazat tento příkaz?',
            'enterCommandText': 'Zadejte text příkazu',
            'enterCommandError': 'Prosím, zadejte text příkazu',
            'customCommandsSaved': 'Vlastní příkazy uloženy',
            'clearCommand': 'Vymazat',
            'copyCommand': 'Kopírovat',
            'saveCommand': 'Uložit',
            'stopCommand': 'Zastavit',
            'pauseCommand': 'Pauza',
            'processCommand': 'Zpracovat',
            'periodCommand': 'Tečka',
            'commaCommand': 'Čárka',
            'questionCommand': 'Otazník',
            'exclamationCommand': 'Vykřičník',
            'newLineCommand': 'Nový řádek',
            'capitalizeCommand': 'Velké písmeno',
            'colonCommand': 'Двокрапка',
            'instructionsTab': 'Інструкції',
        },
        'cs-CZ': {
            title: 'Rozpoznávání řeči',
            settings: 'Nastavení',
            notepadTab: 'Poznámkový blok',
            savedTab: 'Uložené texty',
            billingTab: 'Statistika API',
            startRecording: 'Zahájit nahrávání',
            stopRecording: 'Zastavit nahrávání',
            copyText: 'Kopírovat text',
            clearNotepad: 'Vymazat poznámkový blok',
            copied: 'Zkopírováno!',
            browserAPI: 'Nahrávání přes prohlížeč API',
            googleAPI: 'Nahrávání přes Google API',
            noSavedTexts: 'Žádné uložené texty',
            recordFrom: 'Nahrávání od',
            delete: 'Smazat',
            close: 'Zavřít',
            clearMemory: 'Vymazat paměť',
            read: 'Přečíst',
            pause: 'Pauza',
            continue: 'Pokračovat',
            stop: 'Stop',
            save: 'Uložit',
            cancel: 'Zrušit',
            settingsTitle: 'Nastavení',
            googleKey: 'Google Speech API Klíč',
            openaiKey: 'OpenAI API Klíč',
            language: 'Jazyk rozpoznávání',
            sites: 'Stránky pro TTS (oddělené čárkou)',
            voice: 'Hlas OpenAI TTS',
            model: 'Model OpenAI TTS',
            fontSettings: 'Nastavení písma',
            font: 'Písmo',
            fontSize: 'Velikost písma',
            fontWeight: 'Tloušťka písma',
            lineHeight: 'Výška řádku (px)',
            recordingStyle: 'Styl rozpoznávání',
            byWord: 'Po slovech',
            byPhrase: 'Po frázích',
            billingStats: 'Statistika využití',
            openaiTokens: 'Tokeny OpenAI',
            googleMinutes: 'Minuty Google Speech',
            totalTokens: 'Celkem tokenů:',
            inTokens: 'Vstupní:',
            outTokens: 'Výstupní:',
            totalMinutes: 'Celkem minut:',
            resetBilling: 'Resetovat statistiku',
            fontNormal: 'Normální',
            fontMedium: 'Střední',
            fontSemiBold: 'Polotučné',
            fontBold: 'Tučné',
            noMicAccess: 'Nelze získat přístup k mikrofonu',
            errorAudioInit: 'Nepodařilo se inicializovat audio. Použijte Chrome pro lepší podporu.',
            noKeySpecified: 'Prosím, zadejte API klíč {0} v nastavení',
            errorTTS: 'Chyba při generování řeči. Zkontrolujte konzoli pro podrobnosti.',
            errorPlayAudio: 'Nelze přehrát audio. Zkontrolujte nastavení prohlížeče.',
            sendToAI: 'Odeslat do AI',
            processing: 'Zpracování...',
            selectAIProvider: 'Vyberte AI poskytovatele',
            useGemini: 'Použít Google Gemini',
            useGPT: 'Použít GPT',
            cancel: 'Zrušit',
            noApiKey: 'Není zadán API klíč pro {0}. Prosím, přidejte jej v nastavení.',
            processingError: 'Chyba při zpracování: {0}',
            aiSettings: 'Nastavení AI zpracování',
            geminiKey: 'Google Gemini API Klíč',
            geminiUrl: 'URL API Gemini',
            gptKey: 'GPT API Klíč',
            gptUrl: 'URL API GPT',
            systemPrompt: 'Systémový prompt',
            mainPrompt: 'Hlavní prompt',
            historyCount: 'Počet zpráv z historie',
            aiTab: 'AI zpracování',
            clearAI: 'Vymazat výsledek',
            forceAPI: 'Vynutit použití API',
            aiSettingsTitle: 'Nastavení zpracování textu',
            openAISettings: 'Nastavení AI zpracování',
            aiSettingsSaved: 'Nastavení AI uloženo',
            settingsSaved: 'Nastavení uloženo',
            noTextToProcess: 'Žádný text ke zpracování',
            temperature: 'Teplota (0-2)',
            maxTokens: 'Maximum tokenů',
            gptModel: 'Model GPT',
            geminiModel: 'Model Gemini',
            defaultAIProvider: 'Výchozí AI poskytovatel',
            geminiSettings: 'Nastavení Google Gemini',
            gptSettings: 'Nastavení OpenAI GPT',
            commonSettings: 'Obecná nastavení požadavků',
            contentBlocked: 'Obsah blokován: {0}',
            apiError: 'Chyba API: {0}',
            pauseRecording: 'Pauza',
            continueRecording: 'Pokračovat',
            webAPI: 'Web API',
            cloudAPI: 'Cloud API',
            'gptTokens': 'GPT Tokeny',
            'geminiTokens': 'Gemini Tokeny',
            'aiTokensUsage': 'Využití AI tokenů',
            'customCommands': 'Vlastní příkazy',
            'addCommand': 'Přidat příkaz',
            'command': 'Příkaz',
            'action': 'Akce',
            'add': 'Přidat',
            'confirmDeleteCommand': 'Jste si jisti, že chcete smazat tento příkaz?',
            'enterCommandText': 'Zadejte text příkazu',
            'enterCommandError': 'Prosím, zadejte text příkazu',
            'customCommandsSaved': 'Vlastní příkazy uloženy',
            'clearCommand': 'Vymazat',
            'copyCommand': 'Kopírovat',
            'saveCommand': 'Uložit',
            'stopCommand': 'Zastavit',
            'pauseCommand': 'Pauza',
            'processCommand': 'Zpracovat',
            'periodCommand': 'Tečka',
            'commaCommand': 'Čárka',
            'questionCommand': 'Otazník',
            'exclamationCommand': 'Vykřičník',
            'newLineCommand': 'Nový řádek',
            'capitalizeCommand': 'Velké písmeno',
            'colonCommand': 'Dvojtečka',
            'instructionsTab': 'Instrukce',
        },
    };

    const darkModeStyles = `
        .${PREFIX}speech-modal.dark-mode {
            background: #222 !important;
            color: #eee !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}notepad {
            background: #333 !important;
            color: #fff !important;
            border-color: #555 !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}tab {
            background-color: #333 !important;
            color: #eee !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}tab.${PREFIX}active {
            background-color: #444 !important;
            border-color: #666 !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}btn-secondary {
            background: #444 !important;
            color: #eee !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}btn-secondary:hover {
            background: #555 !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}settings-modal {
            background: #222 !important;
            color: #eee !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}form-group input,
        .${PREFIX}speech-modal.dark-mode .${PREFIX}form-group select,
        .${PREFIX}speech-modal.dark-mode .${PREFIX}form-group textarea {
            background-color: #333 !important;
            color: #eee !important;
            border-color: #555 !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}billing-stats {
            background-color: #333 !important;
            border-color: #555 !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}modal-header h2 {
            margin: 0 !important;
            font-size: 18px !important;
            color: #fff8f8 !important;
            font-weight: bold !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}notepad-line {
            min-height: 24px !important;
            margin: 0 !important;
            padding: 0 !important;
            text-align: left !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            font-family: inherit !important;
            color: #0dff00 !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}notepad-lines {
            line-height: 24px !important;
            background-image: linear-gradient(#f1f1f1 1px, transparent 1px) !important;
            background-size: 100% 24px !important;
            padding: 0 !important;
            margin: 0 !important;
            height: 320px !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}notepad-line {
            min-height: 24px !important;
            margin: 0 !important;
            padding: 0 !important;
            text-align: left !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            font-family: inherit !important;
            color: #ffffff !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}button-footer {
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            padding: 15px 20px !important;
            background-color: #222222 !important;
            border-top: 1px solid #eee !important;
            display: flex !important;
            gap: 10px !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            z-index: 10 !important;
        }

    `;
    // Создаем изолированные стили с префиксами
    const mainStyles = `
        .${PREFIX}speech-modal {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 800px !important;
            height: 650px !important;
            background: white !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3) !important;
            z-index: 2147483647 !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 20px !important;
            font-family: Arial, sans-serif !important;
            color: #333 !important;
            box-sizing: border-box !important;
        }

        .${PREFIX}speech-modal * {
            box-sizing: border-box !important;
            font-family: Arial, sans-serif !important;
        }

        .${PREFIX}notepad {
            border: 1px solid #ccc !important;
            border-radius: 4px !important;
            padding: 15px !important;
            margin-bottom: 15px !important;
            background: #f9f9f9 !important;
            overflow-y: auto !important;
            font-family: "Courier New", monospace !important;
            font-size: 16px !important;
            font-weight: 500 !important;
            color: #333 !important;
        }

        .${PREFIX}notepad-lines {
            line-height: 24px !important;
            background-image: linear-gradient(#e0e0e0 1px, transparent 1px) !important;
            background-size: 100% 24px !important;
            padding: 0 !important;
            margin: 0 !important;
            height: 320px !important;
        }

        .${PREFIX}notepad-line {
            min-height: 24px !important;
            margin: 0 !important;
            padding: 0 !important;
            text-align: left !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            font-family: inherit !important;
            color: #333 !important;
        }

        .${PREFIX}settings-modal {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 500px !important;
            background: white !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3) !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            font-family: Arial, sans-serif !important;
            color: #333 !important;
        }

        .${PREFIX}modal-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 15px !important;
        }

        .${PREFIX}modal-header h2 {
            margin: 0 !important;
            font-size: 18px !important;
            color: #333 !important;
            font-weight: bold !important;
        }

        .${PREFIX}tab-container {
            display: flex !important;
            border-bottom: 1px solid #ccc !important;
            margin-bottom: 15px !important;
        }

        .${PREFIX}tab {
            padding: 10px 20px !important;
            cursor: pointer !important;
            border: 1px solid transparent !important;
            border-bottom: none !important;
            margin-right: 5px !important;
            border-radius: 5px 5px 0 0 !important;
            background-color: #fff !important;
            color: #333 !important;
        }

        .${PREFIX}tab.${PREFIX}active {
            background-color: #f0f0f0 !important;
            border-color: #ccc !important;
            font-weight: bold !important;
        }

        .${PREFIX}tab-content {
            display: none !important;
            flex: 1 !important;
            flex-direction: column !important;
            overflow: auto !important;
            margin-bottom: 20px !important;
        }

        .${PREFIX}tab-content.${PREFIX}active {
            display: flex !important;
        }

        .${PREFIX}button-group {
            display: flex !important;
            gap: 10px !important;
            margin-top: 10px !important;
            align-items: center !important;
            flex-wrap: wrap !important;
        }

        .${PREFIX}btn {
            padding: 8px 16px !important;
            border: none !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-weight: bold !important;
            font-size: 14px !important;
            text-align: center !important;
            text-decoration: none !important;
            display: inline-block !important;
            transition: background-color 0.3s !important;
        }

        .${PREFIX}btn-success {
            background-color: #28a745 !important;
            color: white !important;
            border: none !important;
            transition: background-color 0.3s !important;
        }

        .${PREFIX}btn-success:hover {
            background-color: #218838 !important;
        }

        .${PREFIX}btn-success:active {
            background-color: #1e7e34 !important;
        }

        .${PREFIX}btn-success:focus {
            box-shadow: 0 0 0 0.2rem rgba(40, 167, 69, 0.5) !important;
            outline: none !important;
        }

        .${PREFIX}btn-primary {
            background: #4285f4 !important;
            color: white !important;
        }

        .${PREFIX}btn-primary:hover {
            background: #3367d6 !important;
        }

        .${PREFIX}btn-secondary {
            background: #f1f1f1 !important;
            color: #333 !important;
        }

        .${PREFIX}btn-secondary:hover {
            background: #e0e0e0 !important;
        }

        .${PREFIX}btn-danger {
            background: #ea4335 !important;
            color: white !important;
        }

        .${PREFIX}btn-danger:hover {
            background: #d32f2f !important;
        }

        .${PREFIX}form-group {
            margin-bottom: 15px !important;
        }

        .${PREFIX}form-group label {
            display: block !important;
            margin-bottom: 5px !important;
            font-weight: bold !important;
            color: #333 !important;
        }

        .${PREFIX}form-group input, .${PREFIX}form-group select {
            width: 100% !important;
            padding: 8px !important;
            border: 1px solid #ddd !important;
            border-radius: 4px !important;
            font-size: 14px !important;
            color: #333 !important;
            background-color: #fff !important;
        }

        .${PREFIX}form-group textarea {
            width: 100% !important;
            padding: 8px !important;
            border: 1px solid #ddd !important;
            border-radius: 4px !important;
            min-height: 80px !important;
            resize: vertical !important;
            font-size: 14px !important;
            color: #333 !important;
            background-color: #fff !important;
        }

        .${PREFIX}read-button {
            position: absolute !important;
            background: #4285f4 !important;
            color: white !important;
            border: none !important;
            border-radius: 4px !important;
            padding: 5px 10px !important;
            cursor: pointer !important;
            font-size: 12px !important;
            z-index: 2147483646 !important;
            font-family: Arial, sans-serif !important;
        }

        .${PREFIX}tts-controls {
            position: fixed !important;
            bottom: 20px !important;
            right: 20px !important;
            background: white !important;
            padding: 10px !important;
            border-radius: 8px !important;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2) !important;
            display: flex !important;
            gap: 8px !important;
            z-index: 2147483645 !important;
        }

        .${PREFIX}overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background-color: rgba(0, 0, 0, 0.5) !important;
            z-index: 2147483646 !important;
        }

        .${PREFIX}recording-indicator {
            display: inline-flex !important;
            align-items: center !important;
            margin-left: 15px !important;
            font-size: 14px !important;
            color: #333 !important;
        }

        .${PREFIX}recording-indicator-dot {
            width: 10px !important;
            height: 10px !important;
            border-radius: 50% !important;
            background-color: #ea4335 !important;
            margin-right: 5px !important;
            animation: ${PREFIX}blink 1.5s infinite !important;
        }

        @keyframes ${PREFIX}blink {
            0% { opacity: 1; }
            50% { opacity: 0.3; }
            100% { opacity: 1; }
        }

        .${PREFIX}font-settings {
            margin-top: 15px !important;
            border-top: 1px solid #eee !important;
            padding-top: 15px !important;
        }

        .${PREFIX}font-settings h3 {
            margin-top: 0 !important;
            margin-bottom: 10px !important;
            font-size: 16px !important;
            color: #333 !important;
        }

        .${PREFIX}font-settings-row {
            display: flex !important;
            gap: 15px !important;
            margin-bottom: 10px !important;
        }

        .${PREFIX}font-settings-item {
            flex: 1 !important;
        }

        .${PREFIX}billing-stats {
            margin-top: 10px !important;
            padding: 15px !important;
            background-color: #f9f9f9 !important;
            border-radius: 5px !important;
            border: 1px solid #eee !important;
        }

        .${PREFIX}billing-section {
            margin-bottom: 20px !important;
        }

        .${PREFIX}billing-section h3 {
            margin-top: 0 !important;
            margin-bottom: 10px !important;
            font-size: 16px !important;
            color: #333 !important;
        }

        .${PREFIX}billing-item {
            display: flex !important;
            justify-content: space-between !important;
            margin-bottom: 5px !important;
        }

        .${PREFIX}billing-item-label {
            font-weight: bold !important;
        }

        .${PREFIX}billing-total {
            margin-top: 10px !important;
            padding-top: 10px !important;
            border-top: 1px solid #eee !important;
            font-weight: bold !important;
        }

        #${PREFIX}speech-assistant-button {
            position: fixed !important;
            bottom: calc(25% - 25px) !important;
            right: 20px !important;
            z-index: 2147483640 !important;
            width: 50px !important;
            height: 50px !important;
            border-radius: 50% !important;
            background-color: #4285f4 !important;
            color: white !important;
            border: none !important;
            font-size: 20px !important;
            cursor: pointer !important;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: background-color 0.3s !important;
        }

        #${PREFIX}speech-assistant-button:hover {
            background-color: #3367d6 !important;
        }

        .${PREFIX}ai-settings {
            margin-top: 15px !important;
            border-top: 1px solid #eee !important;
            padding-top: 15px !important;
        }

        .${PREFIX}ai-settings h3 {
            margin-top: 0 !important;
            margin-bottom: 10px !important;
            font-size: 16px !important;
            color: #333 !important;
        }

        .${PREFIX}ai-output {
            padding: 15px !important;
            line-height: 1.5 !important;
            font-family: Arial, sans-serif !important;
            color: #333 !important;
        }

        .${PREFIX}ai-output p {
            margin-bottom: 10px !important;
        }

        .${PREFIX}loading {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 100% !important;
            color: #666 !important;
            font-style: italic !important;
        }

        .${PREFIX}notepad-line:empty::after {
            content: "\\00a0" !important;
            display: inline-block !important;
        }

        .${PREFIX}notepad:focus {
            outline: 1px solid #4285f4 !important;
        }

        .${PREFIX}notepad-line:focus {
            outline: none !important;
        }

        .${PREFIX}provider-selection {
            padding: 20px !important;
            text-align: center !important;
        }

        #${PREFIX}saved-texts-list {
            max-height: 380px !important;
            overflow-y: auto !important;
        }

        .${PREFIX}button-footer {
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            padding: 15px 20px !important;
            background-color: white !important;
            border-top: 1px solid #eee !important;
            display: flex !important;
            gap: 10px !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            z-index: 10 !important;
        }

        .${PREFIX}speech-modal {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 800px !important;
            height: 650px !important;
            background: white !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3) !important;
            z-index: 2147483647 !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 20px !important;
            padding-bottom: 70px !important; // Добавляем отступ для кнопок
            font-family: Arial, sans-serif !important;
            color: #333 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
        }

        .${PREFIX}ai-settings-modal {
            width: 600px !important;
        }

        .${PREFIX}settings-modal textarea {
            font-family: monospace !important;
            resize: vertical !important;
        }

        .${PREFIX}settings-modal {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 500px !important;
            max-height: 80vh !important; // Ограничение максимальной высоты
            background: white !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3) !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            font-family: Arial, sans-serif !important;
            color: #333 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
        }

        .${PREFIX}settings-modal-content {
            overflow-y: auto !important;
            max-height: calc(80vh - 120px) !important;
            padding-right: 10px !important;
        }

        .${PREFIX}settings-modal-footer {
            margin-top: 15px !important;
            padding-top: 15px !important;
            border-top: 1px solid #eee !important;
        }

        .${PREFIX}settings-modal {
            max-height: 80vh !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
        }

        #${PREFIX}pause-recording {
            display: none !important;
        }

        /* И показываем кнопку паузы только когда идёт запись */
        .${PREFIX}btn-danger + #${PREFIX}pause-recording {
            display: inline-block !important;
        }

        .${PREFIX}volume-meter {
            width: 20px;
            height: 100px;
            background-color: #f0f0f0;
            border: 1px solid #ccc;
            position: absolute;
            bottom: 20px;
            right: 20px;
            display: none;
            z-index: 2147483640;
        }

        .${PREFIX}volume-level {
            width: 100%;
            background-color: #4285f4;
            position: absolute;
            bottom: 0;
            transition: height 0.1s ease-out;
        }

        .${PREFIX}recording-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .${PREFIX}notepad[data-recording-style="byWord"] {
            border-left: 3px solid #4285f4 !important; /* синяя граница для режима по словам */
        }

        .${PREFIX}notepad[data-recording-style="byPhrase"] {
            border-left: 3px solid #ea4335 !important; /* красная граница для режима по фразам */
        }

    `;

    // Добавим новые стили для фиксированных кнопок записи
    const recordingControlsStyles = `
     .${PREFIX}recording-fixed-controls {
         position: fixed !important;
         bottom: 120px !important;
         right: 80px !important;
         background-color: rgba(255, 255, 255, 0.9) !important;
         border-radius: 10px !important;
         box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2) !important;
         padding: 10px 15px !important;
         display: flex !important;
         gap: 10px !important;
         z-index: 2147483646 !important;
         align-items: center !important;
     }

     .${PREFIX}speech-modal.dark-mode .${PREFIX}recording-fixed-controls {
         background-color: rgba(34, 34, 34, 0.9) !important;
     }

     .${PREFIX}recording-status {
         display: flex !important;
         align-items: center !important;
         gap: 5px !important;
         font-size: 12px !important;
         color: #666 !important;
     }

     .${PREFIX}speech-modal.dark-mode .${PREFIX}recording-status {
         color: #aaa !important;
     }

     .${PREFIX}recording-button-group {
         display: flex !important;
         gap: 5px !important;
     }
     `;

    const styles = `
        ${mainStyles}
        ${darkModeStyles}
        ${recordingControlsStyles}
    `;


    // Функция для создания фиксированных кнопок записи
    function createFixedRecordingControls() {
        // Удаляем предыдущие контролы, если они существуют
        const existingControls = document.querySelector(`.${PREFIX}recording-fixed-controls`);
        if (existingControls) {
            existingControls.remove();
        }

        // Создаем контейнер для фиксированных кнопок
        const fixedControls = document.createElement('div');
        fixedControls.className = `${PREFIX}recording-fixed-controls`;

        // Группа кнопок для управления записью
        const buttonGroup = document.createElement('div');
        buttonGroup.className = `${PREFIX}recording-button-group`;

        // Кнопка Старт/Стоп
        const startButton = document.createElement('button');
        startButton.id = `${PREFIX}fixed-start-recording`;
        startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
        startButton.textContent = isRecording ? t('stopRecording') : t('startRecording');

        // Кнопка Пауза/Продолжить
        const pauseButton = document.createElement('button');
        pauseButton.id = `${PREFIX}fixed-pause-recording`;
        pauseButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        pauseButton.textContent = isPaused ? t('continueRecording') : t('pauseRecording');
        pauseButton.style.display = isRecording ? 'block' : 'none';

        // Индикатор статуса записи
        const status = document.createElement('div');
        status.className = `${PREFIX}recording-status`;

        const indicator = document.createElement('div');
        indicator.className = `${PREFIX}recording-indicator-dot`;
        indicator.style.display = isRecording ? 'block' : 'none';

        const statusText = document.createElement('span');
        statusText.id = `${PREFIX}recording-status-text`;
        statusText.textContent = isRecording ?
            (settings.forceAPI === 'google' ? t('cloudAPI') : t('webAPI')) :
            '';

        status.appendChild(indicator);
        status.appendChild(statusText);

        // Добавляем элементы в контейнер
        buttonGroup.appendChild(startButton);
        // buttonGroup.appendChild(pauseButton);

        fixedControls.appendChild(buttonGroup);
        fixedControls.appendChild(status);

        // Добавляем контролы в тело документа
        document.body.appendChild(fixedControls);

        // Настраиваем обработчики событий
        startButton.onclick = function () {
            // Синхронизируем с основной кнопкой записи
            const mainStartButton = document.getElementById(`${PREFIX}start-recording`);
            if (mainStartButton) {
                mainStartButton.click();
            } else {
                // Если основной кнопки нет, создаем модальное окно
                createSpeechModal();
                setTimeout(() => {
                    const newMainStartButton = document.getElementById(`${PREFIX}start-recording`);
                    if (newMainStartButton) {
                        newMainStartButton.click();
                    }
                }, 100);
            }

            // Обновляем состояние кнопок
            updateFixedControlsState();
        };

        pauseButton.onclick = function () {
            // Синхронизируем с основной кнопкой паузы
            const mainPauseButton = document.getElementById(`${PREFIX}pause-recording`);
            if (mainPauseButton) {
                mainPauseButton.click();
            }

            // Обновляем состояние кнопок
            updateFixedControlsState();
        };

        return fixedControls;
    }

    // Функция для обновления состояния фиксированных кнопок
    function updateFixedControlsState() {
        const startButton = document.getElementById(`${PREFIX}fixed-start-recording`);
        const pauseButton = document.getElementById(`${PREFIX}fixed-pause-recording`);
        const indicator = document.querySelector(`.${PREFIX}recording-fixed-controls .${PREFIX}recording-indicator-dot`);
        const statusText = document.getElementById(`${PREFIX}recording-status-text`);

        if (startButton) {
            startButton.textContent = isRecording ? t('stopRecording') : t('startRecording');
            startButton.className = isRecording ?
                `${PREFIX}btn ${PREFIX}btn-danger` :
                `${PREFIX}btn ${PREFIX}btn-success`;
        }

        if (pauseButton) {
            pauseButton.textContent = isPaused ? t('continueRecording') : t('pauseRecording');
            // Показываем кнопку паузы только когда идёт запись
            pauseButton.style.display = isRecording ? 'inline-block' : 'none';
        }

        if (indicator) {
            indicator.style.display = isRecording ? 'block' : 'none';
        }

        if (statusText) {
            statusText.textContent = isRecording ?
                (settings.forceAPI === 'google' ? t('cloudAPI') : t('webAPI')) :
                '';
        }
    }

    function addIsolatedStyles() {
        try {
            // Первый метод - пробуем создать стиль напрямую
            const styleEl = document.createElement('style');
            styleEl.id = `${PREFIX}styles`;
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);
        } catch (e) {
            console.warn('Не удалось добавить стили напрямую из-за CSP, пробуем альтернативный метод');

            try {
                // Второй метод - создаем Shadow DOM
                const shadowHost = document.createElement('div');
                shadowHost.id = `${PREFIX}shadow-host`;
                shadowHost.style.display = 'none';
                document.body.appendChild(shadowHost);

                // Создаем shadow root
                const shadowRoot = shadowHost.attachShadow({
                    mode: 'open'
                });

                // Добавляем стили в shadow DOM
                const styleEl = document.createElement('style');
                styleEl.textContent = styles;
                shadowRoot.appendChild(styleEl);

                // Сохраняем ссылку для дальнейшего использования
                window[`${PREFIX}shadowRoot`] = shadowRoot;
            } catch (shadowError) {
                console.error('Не удалось создать shadow DOM для обхода CSP', shadowError);

                // Третий метод - используем GM_addStyle если доступно
                if (typeof GM_addStyle === 'function') {
                    GM_addStyle(styles);
                }
            }
        }
    }

    // Вызываем функцию
    addIsolatedStyles();

    // Флаг, чтобы отслеживать, добавлена ли уже кнопка
    let buttonAdded = false;

    // Загружаем сохраненные настройки
    const settings = {
        googleSpeechApiKey: GM_getValue('googleSpeechApiKey', ''),
        openaiApiKey: GM_getValue('openaiApiKey', ''),
        language: GM_getValue('language', 'ru-RU'),
        siteList: GM_getValue('siteList', 'claude.ai,chat.openai.com'),
        ttsVoice: GM_getValue('ttsVoice', 'alloy'),
        ttsModel: GM_getValue('ttsModel', 'tts-1'),
        fontSize: GM_getValue('fontSize', '16'),
        fontFamily: GM_getValue('fontFamily', 'Courier New'),
        fontWeight: GM_getValue('fontWeight', '500'),
        lineHeight: GM_getValue('lineHeight', '24'),
        recordingStyle: GM_getValue('recordingStyle', 'byWord'), // byWord или byPhrase
        forceAPI: GM_getValue('forceAPI', 'browser'), // 'browser' или 'google'
        defaultAIProvider: GM_getValue('defaultAIProvider', 'gpt'), // 'gemini' или 'gpt'
        gptApiKey: GM_getValue('gptApiKey', ''),
        gptApiUrl: GM_getValue('gptApiUrl', 'https://api.openai.com/v1/chat/completions'),
        geminiApiKey: GM_getValue('geminiApiKey', ''),
        geminiApiUrl: GM_getValue('geminiApiUrl', 'https://generativelanguage.googleapis.com/v1beta'),
        geminiModel: GM_getValue('geminiModel', 'gemini-pro'),
        gptModel: GM_getValue('gptModel', 'gpt-3.5-turbo'),
        temperature: GM_getValue('temperature', 0.7),
        maxTokens: GM_getValue('maxTokens', 4096),
        systemPrompt: GM_getValue('systemPrompt', 'Ты помощник, который обрабатывает записи аудио. Твоя задача - исправить ошибки распознавания, добавить пунктуацию и структурировать текст.'),
        mainPrompt: GM_getValue('mainPrompt', 'Обработай следующую запись аудио: {{text}}'),
        historyCount: GM_getValue('historyCount', 3)
    };


    // Константы для голосовых команд
    const VOICE_COMMANDS = {
        'ru-RU': {
            'очистить': 'clear',
            'копировать': 'copy',
            'сохранить': 'save',
            'остановить': 'stop',
            'стоп': 'stop',
            'пауза': 'pause',
            'продолжить': 'continue',
            'обработать': 'process',
            'точка': 'period',
            'запятая': 'comma',
            'вопрос': 'questionMark',
            'восклицательный знак': 'exclamationMark',
            'новая строка': 'newLine',
            'с большой буквы': 'capitalizeNext',
            'двоеточие': 'colon',
        },
        'en-US': {
            'clear': 'clear',
            'copy': 'copy',
            'save': 'save',
            'stop': 'stop',
            'pause': 'pause',
            'continue': 'continue',
            'process': 'process',
            'period': 'period',
            'comma': 'comma',
            'question mark': 'questionMark',
            'exclamation mark': 'exclamationMark',
            'new line': 'newLine',
            'capitalize': 'capitalizeNext',
            'colon': 'colon',
        },
        'uk-UA': {
            'очистити': 'clear',
            'копіювати': 'copy',
            'зберегти': 'save',
            'зупинити': 'stop',
            'stop': 'stop',
            'пауза': 'pause',
            'продовжити': 'continue',
            'обробити': 'process',
            'крапка': 'period',
            'кома': 'comma',
            'знак питання': 'questionMark',
            'знак оклику': 'exclamationMark',
            'новий рядок': 'newLine',
            'з великої літери': 'capitalizeNext',
            'двокрапка': 'colon',
        },
        'cs-CZ': {
            'vymazat': 'clear',
            'kopírovat': 'copy',
            'uložit': 'save',
            'zastavit': 'stop',
            'stop': 'stop',
            'pauza': 'pause',
            'pokračovat': 'continue',
            'zpracovat': 'process',
            'tečka': 'period',
            'čárka': 'comma',
            'otazník': 'questionMark',
            'vykřičník': 'exclamationMark',
            'nový řádek': 'newLine',
            'velké písmeno': 'capitalizeNext',
            'dvojtečka': 'colon',
        }
    };

    // Обновляем голосовые команды с учетом пользовательских
    updateVoiceCommands();
    // Статистика использования API
    const billing = {
        openai: {
            totalTokens: GM_getValue('openai_totalTokens', 0),
            inputTokens: GM_getValue('openai_inputTokens', 0),
            outputTokens: GM_getValue('openai_outputTokens', 0)
        },
        google: {
            totalMinutes: GM_getValue('google_totalMinutes', 0)
        },
        gpt: {
            totalTokens: GM_getValue('gpt_totalTokens', 0),
            inputTokens: GM_getValue('gpt_inputTokens', 0),
            outputTokens: GM_getValue('gpt_outputTokens', 0)
        },
        gemini: {
            totalTokens: GM_getValue('gemini_totalTokens', 0),
            inputTokens: GM_getValue('gemini_inputTokens', 0),
            outputTokens: GM_getValue('gemini_outputTokens', 0)
        }
    };

    // Глобальная переменная для отслеживания наличия активационной фразы
    let activationDetected = false;
    let pendingCommand = '';
    // Глобальные переменные для обработки команд
    let lastProcessedText = ''; // Последний обработанный текст
    let commandActivated = false; // Флаг активации команды
    let activationTimestamp = 0; // Время активации команды
    let pendingCommandCleanup = false; // Флаг ожидания очистки текста от команды
    let commandCleanupTimer = null; // Таймер для отложенной очистки

    /**
     * Определяет наличие команды в тексте и возвращает информацию о ней
     * @param {string} text - текст для анализа
     * @returns {Object} - информация о найденной команде
     */
    function detectCommand(text) {
        if (!text || text.trim() === '')
            return {
                found: false
            };

        const lang = settings.language;
        const lowerText = text.toLowerCase();

        // Активационные фразы для различных языков
        const activationPhrases = {
            'ru-RU': ['помощник', 'компьютер', 'ассистент', 'команда'],
            'en-US': ['assistant', 'computer', 'command'],
            'uk-UA': ['помічник', 'комп\'ютер', 'асистент', 'команда'],
            'cs-CZ': ['asistent', 'počítač', 'příkaz']
        };

        // Собираем все доступные команды, включая пользовательские
        const allCommands = {};
        const allLanguages = new Set(Object.keys(VOICE_COMMANDS));
        const customCommands = GM_getValue('customVoiceCommands', {});

        // Объединяем стандартные и пользовательские команды
        for (const langCode of allLanguages) {
            allCommands[langCode] = {
                ...VOICE_COMMANDS[langCode]
            };
            if (customCommands[langCode]) {
                allCommands[langCode] = {
                    ...allCommands[langCode],
                    ...customCommands[langCode]
                };
            }
        }

        // Проверяем наличие активационной фразы
        let activationFound = false;
        let activationPhrase = '';
        let activationIndex = -1;
        const currentActivationPhrases = activationPhrases[lang] || activationPhrases['ru-RU'];

        for (const phrase of currentActivationPhrases) {
            const index = lowerText.indexOf(phrase);
            if (index !== -1) {
                activationFound = true;
                activationPhrase = phrase;
                activationIndex = index;
                break;
            }
        }

        if (!activationFound) {
            return {
                found: false
            };
        }

        // Находим индекс активационной фразы и её длину
        const activationEnd = activationIndex + activationPhrase.length;

        // Текст до и после активационной фразы
        const beforeActivation = text.substring(0, activationIndex).trim();
        const afterActivation = lowerText.substring(activationEnd).trim();
        const originalAfterActivation = text.substring(activationEnd).trim();

        if (!afterActivation) {
            // Только активационная фраза без команды - специальный случай
            registerProcessedCommand(text, beforeActivation);
            return {
                found: true,
                type: 'activation_only',
                startIndex: activationIndex,
                endIndex: activationEnd,
                action: 'none'
            };
        }

        // Ищем команду в тексте после активационной фразы
        const commandsForLanguage = allCommands[lang] || allCommands['ru-RU'];

        for (const [command, action] of Object.entries(commandsForLanguage)) {
            // Проверяем разные варианты наличия команды
            let commandFound = false;
            let commandIndex = -1;

            if (afterActivation.startsWith(command)) {
                commandFound = true;
                commandIndex = 0;
            } else if (afterActivation.includes(' ' + command + ' ')) {
                commandFound = true;
                commandIndex = afterActivation.indexOf(' ' + command + ' ') + 1;
            } else if (afterActivation === command) {
                commandFound = true;
                commandIndex = 0;
            } else if (afterActivation.includes(' ' + command) &&
                afterActivation.endsWith(' ' + command)) {
                commandFound = true;
                commandIndex = afterActivation.lastIndexOf(' ' + command) + 1;
            }

            if (commandFound) {
                const commandStart = activationEnd + (commandIndex > 0 ? commandIndex : 0);
                const commandEnd = commandStart + command.length;

                // Выполняем действие команды
                executeVoiceCommand(action);

                // Показываем индикатор выполнения команды
                showCommandIndicator(command);

                // Для команд пунктуации вставляем знак
                if (['period', 'comma', 'questionMark', 'exclamationMark', 'colon'].includes(action)) {
                    const punctuation = {
                        'period': '.',
                        'comma': ',',
                        'questionMark': '?',
                        'exclamationMark': '!',
                        'colon': ':'
                    } [action];

                    // Текст после команды
                    const afterCommand = originalAfterActivation.substring(commandIndex + command.length).trim();

                    // Формируем результат: текст до + знак + текст после
                    let replacement = '';
                    if (beforeActivation) {
                        replacement = beforeActivation + ' ' + punctuation;
                    } else {
                        replacement = punctuation;
                    }

                    if (afterCommand) {
                        replacement += ' ' + afterCommand;
                    }

                    // Регистрируем команду для будущей очистки
                    registerProcessedCommand(text, replacement);
                } else {
                    // Для других команд просто удаляем активационную фразу и саму команду
                    const afterCommand = originalAfterActivation.substring(commandIndex + command.length).trim();

                    let replacement = '';
                    if (beforeActivation && afterCommand) {
                        replacement = beforeActivation + ' ' + afterCommand;
                    } else if (beforeActivation) {
                        replacement = beforeActivation;
                    } else if (afterCommand) {
                        replacement = afterCommand;
                    }

                    // Регистрируем команду для будущей очистки
                    registerProcessedCommand(text, replacement);
                }

                return {
                    found: true,
                    type: 'command',
                    command: command,
                    action: action,
                    startIndex: activationIndex,
                    endIndex: commandEnd,
                    punctuation: ['period', 'comma', 'questionMark', 'exclamationMark', 'colon'].includes(action) ? {
                        'period': '.',
                        'comma': ',',
                        'questionMark': '?',
                        'exclamationMark': '!',
                        'colon': ':'
                    } [action] : null
                };
            }
        }

        // Активационная фраза есть, но команда не распознана
        // Считаем это специальной инструкцией
        let replacement = '';
        if (beforeActivation) {
            replacement = beforeActivation + ' ';
        }
        replacement += `{${originalAfterActivation}}`;

        // Регистрируем для будущей очистки
        registerProcessedCommand(text, replacement);

        return {
            found: true,
            type: 'special_instruction',
            instruction: afterActivation,
            startIndex: activationIndex,
            endIndex: activationIndex + activationPhrase.length + afterActivation.length
        };
    }

    function handleVoiceCommand(text) {
        // Проверяем результат detectCommand
        const commandInfo = detectCommand(text);

        // Если команда найдена, возвращаем предварительно очищенный текст
        if (commandInfo.found) {
            return {
                handled: true,
                textToAdd: cleanTextFromCommands(text)
            };
        }

        // Если команда не найдена, возвращаем исходный текст
        return {
            handled: false,
            textToAdd: text
        };
    }

    // Выполнение голосовой команды
    function executeVoiceCommand(action) {
        switch (action) {
            case 'clear':
                // Очистить блокнот
                const clearBtn = document.getElementById(`${PREFIX}clear-button`);
                if (clearBtn) clearBtn.click();
                break;

            case 'copy':
                // Копировать текст
                const copyBtn = document.getElementById(`${PREFIX}copy-button`);
                if (copyBtn) copyBtn.click();
                break;

            case 'save':
                // Сохранить и закрыть
                const copyCloseBtn = document.getElementById(`${PREFIX}copy-close-button`);
                if (copyCloseBtn) copyCloseBtn.click();
                break;

            case 'stop':
                // Остановить запись
                if (isRecording) {
                    const startBtn = document.getElementById(`${PREFIX}start-recording`);
                    if (startBtn) startBtn.click();
                }
                break;

            case 'pause':
                // Поставить на паузу
                if (isRecording && !isPaused) {
                    const pauseBtn = document.getElementById(`${PREFIX}pause-recording`);
                    if (pauseBtn) pauseBtn.click();
                }
                break;

            case 'continue':
                // Продолжить запись
                if (isRecording && isPaused) {
                    const pauseBtn = document.getElementById(`${PREFIX}pause-recording`);
                    if (pauseBtn) pauseBtn.click();
                }
                break;

            case 'process':
                // Обработать текст AI
                const sendToAIBtn = document.getElementById(`${PREFIX}send-to-ai-button`);
                if (sendToAIBtn) sendToAIBtn.click();
                break;

                // Добавляем команды пунктуации
            case 'period':
                insertPunctuation('.');
                break;

            case 'comma':
                insertPunctuation(',');
                break;

            case 'questionMark':
                insertPunctuation('?');
                break;

            case 'exclamationMark':
                insertPunctuation('!');
                break;

            case 'newLine':
                insertNewLine();
                break;

            case 'capitalizeNext':
                setCapitalizeNextWord(true);
                break;

            case 'colon':
                insertPunctuation(':');
                break;
        }
    }

    // Функция для отображения индикатора распознанной команды
    function showCommandIndicator(command) {
        // Создаем всплывающий индикатор
        const indicator = document.createElement('div');
        indicator.style.position = 'fixed';
        indicator.style.top = '10%';
        indicator.style.left = '50%';
        indicator.style.transform = 'translateX(-50%)';
        indicator.style.padding = '10px 20px';
        indicator.style.background = '#4285f4';
        indicator.style.color = 'white';
        indicator.style.borderRadius = '5px';
        indicator.style.zIndex = '2147483647';
        indicator.style.fontWeight = 'bold';
        indicator.style.opacity = '0';
        indicator.style.transition = 'opacity 0.3s ease-in-out';
        indicator.textContent = `Команда: ${command}`;

        document.body.appendChild(indicator);

        // Анимация появления и исчезновения
        setTimeout(() => {
            indicator.style.opacity = '1';

            setTimeout(() => {
                indicator.style.opacity = '0';

                setTimeout(() => {
                    if (document.body.contains(indicator)) {
                        document.body.removeChild(indicator);
                    }
                }, 300);
            }, 2000);
        }, 10);
    }

    /**
     * Очищает текст от команды и возвращает результат
     * @param {string} text - исходный текст
     * @param {Object} commandInfo - информация о команде из detectCommand
     * @returns {string} - очищенный текст
     */
    function cleanTextWithCommandInfo(text, commandInfo) {
        if (!commandInfo.found) {
            return text;
        }

        // Дополнительная проверка на наличие команды в очереди
        const cleanedText = cleanTextFromCommands(text);
        if (cleanedText !== text) {
            return cleanedText;
        }

        // Обрабатываем текст в зависимости от типа команды
        if (commandInfo.type === 'activation_only') {
            // Только активационная фраза - удаляем её полностью
            return text.substring(0, commandInfo.startIndex).trim() +
                (text.substring(0, commandInfo.startIndex).trim() &&
                    text.substring(commandInfo.endIndex).trim() ? ' ' : '') +
                text.substring(commandInfo.endIndex).trim();
        } else if (commandInfo.type === 'command') {
            // Команда найдена
            if (commandInfo.punctuation) {
                // Для команд пунктуации заменяем команду на знак
                return text.substring(0, commandInfo.startIndex).trim() +
                    (text.substring(0, commandInfo.startIndex).trim() ? ' ' : '') +
                    commandInfo.punctuation +
                    (text.substring(commandInfo.endIndex).trim() ? ' ' : '') +
                    text.substring(commandInfo.endIndex).trim();
            } else {
                // Для других команд просто удаляем фразу с командой
                return text.substring(0, commandInfo.startIndex).trim() +
                    (text.substring(0, commandInfo.startIndex).trim() &&
                        text.substring(commandInfo.endIndex).trim() ? ' ' : '') +
                    text.substring(commandInfo.endIndex).trim();
            }
        } else if (commandInfo.type === 'special_instruction') {
            // Специальная инструкция - заменяем на текст в фигурных скобках
            return text.substring(0, commandInfo.startIndex).trim() +
                (text.substring(0, commandInfo.startIndex).trim() ? ' ' : '') +
                `{${commandInfo.instruction}}` +
                (text.substring(commandInfo.endIndex).trim() ? ' ' : '') +
                text.substring(commandInfo.endIndex).trim();
        }

        // Если ничего не подошло, возвращаем исходный текст
        return text;
    }

    /**
     * Отложенная обработка команд для учета задержки поступления текста
     */
    function scheduleCommandCleanup() {
        // Отменяем предыдущий таймер, если был
        if (commandCleanupTimer) {
            clearTimeout(commandCleanupTimer);
        }

        // Устанавливаем новый таймер
        commandCleanupTimer = setTimeout(() => {
            const notepad = document.getElementById(`${PREFIX}notepad`);
            if (!notepad) return;

            // Получаем текущий текст из блокнота
            const currentText = getNotepadText(notepad);

            // Проверяем на наличие обработанных команд
            const cleanedText = cleanTextFromCommands(currentText);

            // Если текст изменился после очистки
            if (cleanedText !== currentText) {
                // Сохраняем строки очищенного текста
                const lines = cleanedText.split('\n');

                // Очищаем блокнот
                safeHTML(notepad, 'innerHTML', '');

                // Добавляем очищенные строки
                lines.forEach(line => {
                    if (line.trim()) { // Добавляем только непустые строки
                        const lineElement = document.createElement('div');
                        lineElement.className = `${PREFIX}notepad-line`;
                        lineElement.textContent = line;
                        notepad.appendChild(lineElement);
                    }
                });

                // Обновляем глобальные переменные отслеживания текста
                if (settings.recordingStyle === 'byWord') {
                    currentTextBuffer = cleanedText.split(/\s+/).filter(w => w.trim());
                } else {
                    // Режим по фразам
                    const allLines = cleanedText.split('\n');
                    currentText = allLines.slice(0, -1);
                    currentLine = allLines[allLines.length - 1] || '';
                }

                // Прокручиваем блокнот вниз
                notepad.scrollTop = notepad.scrollHeight;
            }

            // Оригинальный код дальше...
            // (оставьте остальной код функции без изменений)
        }, 500);
    }

    // Глобальная переменная для отслеживания необходимости капитализации следующего слова
    let capitalizeNextWord = false;

    // Функция для вставки знака пунктуации
    function insertPunctuation(mark) {
        const notepad = document.getElementById(`${PREFIX}notepad`);
        if (!notepad) return;

        // Получаем последнюю строку блокнота
        const lastLine = notepad.lastChild;
        if (!lastLine) return;

        // Получаем текущий текст
        let currentText = lastLine.textContent || '';

        // Убираем пробел в конце, если есть
        if (currentText.endsWith(' ')) {
            currentText = currentText.slice(0, -1);
        }

        // Добавляем знак пунктуации и пробел
        lastLine.textContent = currentText + mark + ' ';

        // Обновляем currentLine в глобальных переменных
        if (settings.recordingStyle === 'byPhrase') {
            currentLine = lastLine.textContent;
        }

        // Регистрируем "фальшивую команду" для предотвращения дублирования знаков
        const fullText = getNotepadText(notepad);
        registerProcessedCommand(fullText + mark, fullText);
    }

    // Функция для вставки новой строки
    function insertNewLine() {
        const notepad = document.getElementById(`${PREFIX}notepad`);
        if (!notepad) return;

        // Создаем новую строку
        const newLine = document.createElement('div');
        newLine.className = `${PREFIX}notepad-line`;
        notepad.appendChild(newLine);

        // Обновляем глобальные переменные
        if (settings.recordingStyle === 'byPhrase') {
            currentText.push(currentLine);
            currentLine = '';
        } else {
            // В режиме по словам
            currentText.push(currentTextBuffer.join(' '));
            currentTextBuffer = [];
        }

        // Прокручиваем блокнот вниз
        notepad.scrollTop = notepad.scrollHeight;
    }

    // Функция для установки флага капитализации следующего слова
    function setCapitalizeNextWord(value) {
        capitalizeNextWord = value;
    }

    function setupAutoSave() {
        let autoSaveInterval = null;
        let lastContent = '';

        // Функция для проверки изменений и сохранения
        function checkAndSave() {
            const notepad = document.getElementById(`${PREFIX}notepad`);
            if (!notepad) return;

            const currentContent = getNotepadText(notepad);

            // Если содержимое изменилось и не пустое
            if (currentContent !== lastContent && currentContent.trim() !== '') {
                // Сохраняем временную версию
                const tempSave = {
                    date: new Date().toLocaleString() + ' (АВТО)',
                    text: currentContent
                };

                // Добавляем только если размер не слишком большой
                // чтобы избежать засорения истории
                if (currentContent.length > 50) {
                    // Проверяем, нет ли уже похожего сохранения
                    const isDuplicate = savedTexts.some(item =>
                        item.text === currentContent ||
                        (item.text.includes(currentContent) && item.date.includes('АВТО'))
                    );

                    if (!isDuplicate) {
                        savedTexts.push(tempSave);
                        // Ограничиваем количество автосохранений
                        const autoSaves = savedTexts.filter(item => item.date.includes('АВТО'));
                        if (autoSaves.length > 5) {
                            // Удаляем старые автосохранения
                            for (let i = 0; i < savedTexts.length; i++) {
                                if (savedTexts[i].date.includes('АВТО')) {
                                    savedTexts.splice(i, 1);
                                    break;
                                }
                            }
                        }
                        GM_setValue('savedTexts', savedTexts);

                        // Обновляем список, если он открыт
                        const savedList = document.getElementById(`${PREFIX}saved-texts-list`);
                        if (savedList) {
                            updateSavedTextsList(savedList);
                        }
                    }
                }

                lastContent = currentContent;
            }
        }

        // Запуск автосохранения при создании модального окна
        function startAutoSave() {
            // Останавливаем предыдущий интервал, если был
            if (autoSaveInterval) {
                clearInterval(autoSaveInterval);
            }

            // Устанавливаем новый интервал
            autoSaveInterval = setInterval(checkAndSave, 30000); // каждые 30 секунд
        }

        // Остановка автосохранения при закрытии модального окна
        function stopAutoSave() {
            if (autoSaveInterval) {
                clearInterval(autoSaveInterval);
                autoSaveInterval = null;
            }
        }

        return {
            startAutoSave,
            stopAutoSave
        };
    }

    const autoSaver = setupAutoSave();
    // Сохраненные тексты в памяти
    let savedTexts = GM_getValue('savedTexts', []);

    // Текущий текст распознавания и текущая строка
    let currentText = [];
    let currentLine = '';
    let currentTextBuffer = []; // Буфер для сохранения слов при использовании режима "по словам"

    // Определяем, включен ли режим отладки
    const isDebugMode = false;

    // Функция для вывода отладочной информации
    function debug(...args) {
        if (isDebugMode) {
            // // console.log(`[${PREFIX}]`, ...args);
        }
    }

    // Переменная для хранения состояния записи
    let isRecording = false;

    // Переменная для хранения текущего языка интерфейса
    let currentUILang = 'ru-RU';

    // Вспомогательная функция для получения перевода
    function t(key) {
        // Пытаемся получить перевод для текущего языка интерфейса
        if (translations[currentUILang] && translations[currentUILang][key]) {
            return translations[currentUILang][key];
        }

        // Если не нашли, пробуем русский как запасной вариант
        if (translations['ru-RU'] && translations['ru-RU'][key]) {
            return translations['ru-RU'][key];
        }

        // Если и в русском нет, просто возвращаем ключ
        return key;
    }

    // Формат строки, замена {0}, {1} и т.д. на аргументы
    function format(str, ...args) {
        return str.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] !== 'undefined' ? args[number] : match;
        });
    }

    // Функция для обновления статистики OpenAI
    function updateOpenAIStats(inputTokens, outputTokens) {
        billing.openai.inputTokens += inputTokens;
        billing.openai.outputTokens += outputTokens;
        billing.openai.totalTokens = billing.openai.inputTokens + billing.openai.outputTokens;

        GM_setValue('openai_inputTokens', billing.openai.inputTokens);
        GM_setValue('openai_outputTokens', billing.openai.outputTokens);
        GM_setValue('openai_totalTokens', billing.openai.totalTokens);
    }

    // Функция для обновления статистики Google Speech
    function updateGoogleStats(durationSeconds) {
        const durationMinutes = durationSeconds / 60;
        billing.google.totalMinutes += durationMinutes;

        GM_setValue('google_totalMinutes', billing.google.totalMinutes);
    }

    // Приблизительный подсчет токенов в тексте OpenAI
    function estimateTokens(text) {
        // Очень приблизительно: 1 токен ~= 4 символа для английского языка
        // Для других языков может быть иначе, но это простое приближение
        return Math.ceil(text.length / 4);
    }

    // Функция для обновления статистики GPT
    function updateGPTStats(inputTokens, outputTokens) {
        billing.gpt.inputTokens += inputTokens;
        billing.gpt.outputTokens += outputTokens;
        billing.gpt.totalTokens = billing.gpt.inputTokens + billing.gpt.outputTokens;

        GM_setValue('gpt_inputTokens', billing.gpt.inputTokens);
        GM_setValue('gpt_outputTokens', billing.gpt.outputTokens);
        GM_setValue('gpt_totalTokens', billing.gpt.totalTokens);
    }

    // Функция для обновления статистики Gemini
    function updateGeminiStats(inputTokens, outputTokens) {
        billing.gemini.inputTokens += inputTokens;
        billing.gemini.outputTokens += outputTokens;
        billing.gemini.totalTokens = billing.gemini.inputTokens + billing.gemini.outputTokens;

        GM_setValue('gemini_inputTokens', billing.gemini.inputTokens);
        GM_setValue('gemini_outputTokens', billing.gemini.outputTokens);
        GM_setValue('gemini_totalTokens', billing.gemini.totalTokens);
    }

    // Сброс статистики API - обновленная версия
    function resetBillingStats() {
        billing.openai.totalTokens = 0;
        billing.openai.inputTokens = 0;
        billing.openai.outputTokens = 0;
        billing.google.totalMinutes = 0;
        billing.gpt.totalTokens = 0;
        billing.gpt.inputTokens = 0;
        billing.gpt.outputTokens = 0;
        billing.gemini.totalTokens = 0;
        billing.gemini.inputTokens = 0;
        billing.gemini.outputTokens = 0;

        GM_setValue('openai_totalTokens', 0);
        GM_setValue('openai_inputTokens', 0);
        GM_setValue('openai_outputTokens', 0);
        GM_setValue('google_totalMinutes', 0);
        GM_setValue('gpt_totalTokens', 0);
        GM_setValue('gpt_inputTokens', 0);
        GM_setValue('gpt_outputTokens', 0);
        GM_setValue('gemini_totalTokens', 0);
        GM_setValue('gemini_inputTokens', 0);
        GM_setValue('gemini_outputTokens', 0);
    }

    function applyFontSettings() {
        // Обновим настройки из хранилища перед применением (чтобы использовать актуальные значения)
        settings.fontFamily = GM_getValue('fontFamily', settings.fontFamily);
        settings.fontSize = GM_getValue('fontSize', settings.fontSize);
        settings.fontWeight = GM_getValue('fontWeight', settings.fontWeight);
        settings.lineHeight = GM_getValue('lineHeight', settings.lineHeight);

        const notepad = document.getElementById(`${PREFIX}notepad`);
        if (notepad) {
            // Используем setProperty с !important
            notepad.style.setProperty('font-family', settings.fontFamily, 'important');
            notepad.style.setProperty('font-size', `${settings.fontSize}px`, 'important');
            notepad.style.setProperty('font-weight', settings.fontWeight, 'important');
            notepad.style.setProperty('line-height', `${settings.lineHeight}px`, 'important');
            notepad.style.setProperty('background-size', `100% ${settings.lineHeight}px`, 'important');

            console.log('Применены настройки шрифта:', {
                fontFamily: settings.fontFamily,
                fontSize: settings.fontSize,
                fontWeight: settings.fontWeight,
                lineHeight: settings.lineHeight
            });
        } else {
            console.warn('Не найден элемент #' + PREFIX + 'notepad для применения стилей');
        }
    }

    // Создаем модальное окно для распознавания речи
    function createSpeechModal() {
        // Настраиваем язык интерфейса на основе языка распознавания
        currentUILang = settings.language;

        // Удаляем предыдущее модальное окно и оверлей, если они существуют
        const existingModals = document.querySelectorAll(`.${PREFIX}speech-modal`);
        const existingOverlays = document.querySelectorAll(`.${PREFIX}overlay`);

        existingModals.forEach(modal => {
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        });

        existingOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });


        // Останавливаем запись, если она активна
        if (isRecording) {
            stopRecording();
        }
        applyFontSettings();

        // Создаем оверлей
        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;

        // Создаем модальное окно
        const modal = document.createElement('div');
        modal.className = `${PREFIX}speech-modal`;

        const isDarkMode = GM_getValue('darkMode', false);
        if (isDarkMode) {
            modal.classList.add('dark-mode');
        }

        // Заголовок и кнопка закрытия
        const header = document.createElement('div');
        header.className = `${PREFIX}modal-header`;

        const title = document.createElement('h2');
        title.textContent = t('title');

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.className = `${PREFIX}btn`;
        closeButton.style.fontSize = '20px';
        closeButton.style.padding = '0 8px';
        closeButton.style.background = 'transparent';
        closeButton.onclick = () => {
            // Останавливаем запись, если она активна
            if (isRecording) {
                stopRecording();
            }

            // Сохраняем текущий текст перед закрытием
            saveCurrentText();
            autoSaver.stopAutoSave();
            document.body.removeChild(overlay);
            document.body.removeChild(modal);

        };

        header.appendChild(title);
        header.appendChild(closeButton);

        // Добавляем табы для переключения между блокнотом, сохраненными текстами и статистикой
        const tabContainer = document.createElement('div');
        tabContainer.className = `${PREFIX}tab-container`;

        const notepadTab = document.createElement('div');
        notepadTab.className = `${PREFIX}tab ${PREFIX}active`;
        notepadTab.textContent = t('notepadTab');
        notepadTab.dataset.target = `${PREFIX}notepad-content`;

        const savedTab = document.createElement('div');
        savedTab.className = `${PREFIX}tab`;
        savedTab.textContent = t('savedTab');
        savedTab.dataset.target = `${PREFIX}saved-content`;

        const aiTab = document.createElement('div');
        aiTab.className = `${PREFIX}tab`;
        aiTab.textContent = t('aiTab');
        aiTab.dataset.target = `${PREFIX}ai-content`;

        const billingTab = document.createElement('div');
        billingTab.className = `${PREFIX}tab`;
        billingTab.textContent = t('billingTab');
        billingTab.dataset.target = `${PREFIX}billing-content`;

        const instructionsTab = document.createElement('div');
        instructionsTab.className = `${PREFIX}tab`;
        instructionsTab.textContent = t('instructionsTab');
        instructionsTab.dataset.target = `${PREFIX}instructions-content`;
        // Добавляем все табы
        tabContainer.appendChild(notepadTab);
        tabContainer.appendChild(savedTab);
        tabContainer.appendChild(aiTab);
        tabContainer.appendChild(instructionsTab);
        tabContainer.appendChild(billingTab);

        // Содержимое таба блокнота
        const notepadContent = document.createElement('div');
        notepadContent.className = `${PREFIX}tab-content ${PREFIX}active`;
        notepadContent.id = `${PREFIX}notepad-content`;

        // Блокнот с линиями
        const notepad = document.createElement('div');
        notepad.className = `${PREFIX}notepad ${PREFIX}notepad-lines`;
        notepad.id = `${PREFIX}notepad`;
        // Удаляем эти строки:
        // notepad.style.fontFamily = settings.fontFamily;
        // notepad.style.fontSize = `${settings.fontSize}px`;
        // notepad.style.fontWeight = settings.fontWeight;
        // notepad.style.lineHeight = `${settings.lineHeight}px`;
        // notepad.style.backgroundSize = `100% ${settings.lineHeight}px`;
        notepad.contentEditable = "true"; // Делаем блокнот редактируемым
        notepad.dataset.recordingStyle = settings.recordingStyle;
        // Применяем настройки шрифта сразу после создания блокнота
        setTimeout(() => applyFontSettings(), 50); // Небольшая задержка для обеспечения выполнения
        // Применяем настройки шрифта сразу после создания блокнота
        applyFontSettings();
        // Добавьте это к обработчику input на notepad
        notepad.addEventListener('input', () => {
            // Обновляем текущий текст на основе редактируемого содержимого
            const lines = Array.from(notepad.childNodes)
                .map(node => node.textContent || '')
                .filter(line => line.trim() !== '');

            if (lines.length > 0) {
                currentText = lines.slice(0, -1);
                currentLine = lines[lines.length - 1] || '';
            } else {
                currentText = [];
                currentLine = '';
            }

            // Очищаем буфер, так как пользователь, вероятно, отредактировал текст
            currentTextBuffer = [];

            // Проверяем, есть ли в тексте команды для очистки
            const fullText = getNotepadText(notepad);
            const cleanedText = cleanTextFromCommands(fullText);

            // Если текст изменился после очистки, обновляем блокнот
            if (cleanedText !== fullText) {
                // Разбиваем очищенный текст на строки
                const cleanedLines = cleanedText.split('\n');

                // Очищаем блокнот
                safeHTML(notepad, 'innerHTML', '');

                // Добавляем очищенные строки
                cleanedLines.forEach(line => {
                    if (line.trim()) { // Добавляем только непустые строки
                        const lineElement = document.createElement('div');
                        lineElement.className = `${PREFIX}notepad-line`;
                        lineElement.textContent = line;
                        notepad.appendChild(lineElement);
                    }
                });

                // Обновляем переменные отслеживания текста
                if (cleanedLines.length > 0) {
                    currentText = cleanedLines.slice(0, -1);
                    currentLine = cleanedLines[cleanedLines.length - 1] || '';
                }
            }
        });

        // Добавим обработчик для сохранения структуры строк при нажатии Enter
        notepad.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Позволяем браузеру создать новую строку
                // Но форматируем ее как div с нужным классом при следующем тике
                setTimeout(() => {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const node = range.startContainer;

                        // Если это новый текстовый узел, создаем для него правильный div
                        if (node.nodeType === Node.TEXT_NODE && node.parentNode === notepad) {
                            const div = document.createElement('div');
                            div.className = `${PREFIX}notepad-line`;

                            const text = node.textContent;
                            node.parentNode.removeChild(node);

                            div.textContent = text;
                            notepad.appendChild(div);

                            // Устанавливаем курсор в конец нового div
                            range.setStart(div.firstChild || div, div.firstChild ? div.firstChild.length : 0);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                        // Если уже div, но без правильного класса
                        else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains(`${PREFIX}notepad-line`)) {
                            node.className = `${PREFIX}notepad-line`;
                        }
                    }
                }, 0);
            }
        });

        // Кнопки для блокнота
        const notepadButtonGroup = document.createElement('div');
        notepadButtonGroup.className = `${PREFIX}button-group`;

        // 1. Копировать и закрыть
        const copyCloseButton = document.createElement('button');
        copyCloseButton.textContent = getCopyCloseText();
        copyCloseButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        copyCloseButton.id = `${PREFIX}copy-close-button`;
        copyCloseButton.onclick = () => {
            // Полная остановка записи перед копированием
            fullStopRecording();

            // Копируем текст
            const textToCopy = getNotepadText(notepad);
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    // Сохраняем текущий текст в блок сохраненных текстов
                    saveCurrentText();

                    // Закрываем модальное окно
                    const modalElement = document.querySelector(`.${PREFIX}speech-modal`);
                    const overlayElement = document.querySelector(`.${PREFIX}overlay`);

                    if (modalElement && modalElement.parentNode) {
                        modalElement.parentNode.removeChild(modalElement);
                    }

                    if (overlayElement && overlayElement.parentNode) {
                        overlayElement.parentNode.removeChild(overlayElement);
                    }

                    // !!! ОБНОВЛЯЕМ СОСТОЯНИЕ ФИКСИРОВАННЫХ КНОПОК !!!
                    updateFixedControlsState();

                })
                .catch(err => {
                    console.error('Ошибка при копировании текста:', err);
                    alert('Не удалось скопировать текст в буфер обмена');
                });
        };

        // 2. Копировать текст
        const copyButton = document.createElement('button');
        copyButton.textContent = t('copyText');
        copyButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        copyButton.id = `${PREFIX}copy-button`; // Добавляем ID
        copyButton.onclick = () => {
            const textToCopy = getNotepadText(notepad);
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    const originalText = copyButton.textContent;
                    copyButton.textContent = t('copied');
                    setTimeout(() => {
                        copyButton.textContent = originalText;
                    }, 2000);
                })
                .catch(err => {
                    console.error('Ошибка при копировании текста:', err);
                    alert('Не удалось скопировать текст в буфер обмена');
                });
        };

        // 3. Очистить блокнот
        const clearButton = document.createElement('button');
        clearButton.textContent = t('clearNotepad');
        clearButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        clearButton.id = `${PREFIX}clear-button`; // Добавляем ID
        clearButton.onclick = () => {
            safeHTML(notepad, 'innerHTML', '');
            currentText = [];
            currentLine = '';
            currentTextBuffer = [];
        };

        // 4. Отправить в AI
        const sendToAIButton = document.createElement('button');
        sendToAIButton.textContent = t('sendToAI');
        sendToAIButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        sendToAIButton.id = `${PREFIX}send-to-ai-button`; // Добавляем ID
        sendToAIButton.onclick = () => {
            processTextWithAI();
        };

        notepadButtonGroup.appendChild(copyCloseButton);
        notepadButtonGroup.appendChild(copyButton);
        notepadButtonGroup.appendChild(clearButton);
        notepadButtonGroup.appendChild(sendToAIButton);

        notepadContent.appendChild(notepad);
        notepadContent.appendChild(notepadButtonGroup);

        // Содержимое таба сохраненных текстов
        const savedContent = document.createElement('div');
        savedContent.className = `${PREFIX}tab-content`;
        savedContent.id = `${PREFIX}saved-content`;

        const savedTextsList = document.createElement('div');
        savedTextsList.className = `${PREFIX}notepad`;
        savedTextsList.id = `${PREFIX}saved-texts-list`;

        // Заполняем список сохраненных текстов
        updateSavedTextsList(savedTextsList);

        const clearSavedButton = document.createElement('button');
        clearSavedButton.textContent = t('clearMemory');
        clearSavedButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        clearSavedButton.onclick = () => {
            savedTexts = [];
            GM_setValue('savedTexts', []);
            updateSavedTextsList(savedTextsList);
        };

        savedContent.appendChild(savedTextsList);
        savedContent.appendChild(clearSavedButton);

        // Создадим содержимое таба AI обработки
        const aiContent = document.createElement('div');
        aiContent.className = `${PREFIX}tab-content`;
        aiContent.id = `${PREFIX}ai-content`;

        // Блок для отображения обработанного текста
        const aiOutput = document.createElement('div');
        aiOutput.className = `${PREFIX}ai-output ${PREFIX}notepad`;
        aiOutput.id = `${PREFIX}ai-output`;
        aiOutput.style.maxHeight = '380px';
        aiOutput.style.overflowY = 'auto';

        // Кнопки для работы с AI
        const aiButtonGroup = document.createElement('div');
        aiButtonGroup.className = `${PREFIX}button-group`;

        const aiCopyButton = document.createElement('button');
        aiCopyButton.textContent = t('copyText');
        aiCopyButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        aiCopyButton.onclick = () => {
            const textToCopy = aiOutput.textContent || '';
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    const originalText = aiCopyButton.textContent;
                    aiCopyButton.textContent = t('copied');
                    setTimeout(() => {
                        aiCopyButton.textContent = originalText;
                    }, 2000);
                })
                .catch(err => {
                    console.error('Ошибка при копировании текста:', err);
                    alert('Не удалось скопировать текст в буфер обмена');
                });
        };

        const aiClearButton = document.createElement('button');
        aiClearButton.textContent = t('clearAI');
        aiClearButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        aiClearButton.onclick = () => {
            safeHTML(aiOutput, 'innerHTML', '');
        };

        aiButtonGroup.appendChild(aiCopyButton);
        aiButtonGroup.appendChild(aiClearButton);

        aiContent.appendChild(aiOutput);
        aiContent.appendChild(aiButtonGroup);

        // Содержимое таба статистики API
        const billingContent = document.createElement('div');
        billingContent.className = `${PREFIX}tab-content`;
        billingContent.id = `${PREFIX}billing-content`;

        const billingStats = document.createElement('div');
        billingStats.className = `${PREFIX}billing-stats`;

        // Секция статистики OpenAI TTS
        const openaiSection = document.createElement('div');
        openaiSection.className = `${PREFIX}billing-section`;

        const openaiTitle = document.createElement('h3');
        openaiTitle.textContent = t('openaiTokens');

        const openaiItems = document.createElement('div');

        // Входящие токены
        const inTokensItem = document.createElement('div');
        inTokensItem.className = `${PREFIX}billing-item`;

        const inTokensLabel = document.createElement('div');
        inTokensLabel.className = `${PREFIX}billing-item-label`;
        inTokensLabel.textContent = t('inTokens');

        const inTokensValue = document.createElement('div');
        inTokensValue.id = `${PREFIX}openai-in-tokens`;
        inTokensValue.textContent = billing.openai.inputTokens.toLocaleString();

        inTokensItem.appendChild(inTokensLabel);
        inTokensItem.appendChild(inTokensValue);

        // Исходящие токены
        const outTokensItem = document.createElement('div');
        outTokensItem.className = `${PREFIX}billing-item`;

        const outTokensLabel = document.createElement('div');
        outTokensLabel.className = `${PREFIX}billing-item-label`;
        outTokensLabel.textContent = t('outTokens');

        const outTokensValue = document.createElement('div');
        outTokensValue.id = `${PREFIX}openai-out-tokens`;
        outTokensValue.textContent = billing.openai.outputTokens.toLocaleString();

        outTokensItem.appendChild(outTokensLabel);
        outTokensItem.appendChild(outTokensValue);

        // Всего токенов
        const totalTokensItem = document.createElement('div');
        totalTokensItem.className = `${PREFIX}billing-item ${PREFIX}billing-total`;

        const totalTokensLabel = document.createElement('div');
        totalTokensLabel.className = `${PREFIX}billing-item-label`;
        totalTokensLabel.textContent = t('totalTokens');

        const totalTokensValue = document.createElement('div');
        totalTokensValue.id = `${PREFIX}openai-total-tokens`;
        totalTokensValue.textContent = billing.openai.totalTokens.toLocaleString();

        totalTokensItem.appendChild(totalTokensLabel);
        totalTokensItem.appendChild(totalTokensValue);

        openaiItems.appendChild(inTokensItem);
        openaiItems.appendChild(outTokensItem);
        openaiItems.appendChild(totalTokensItem);

        openaiSection.appendChild(openaiTitle);
        openaiSection.appendChild(openaiItems);

        // Секция статистики Google
        const googleSection = document.createElement('div');
        googleSection.className = `${PREFIX}billing-section`;

        const googleTitle = document.createElement('h3');
        googleTitle.textContent = t('googleMinutes');

        const googleItems = document.createElement('div');

        // Всего минут
        const totalMinutesItem = document.createElement('div');
        totalMinutesItem.className = `${PREFIX}billing-item ${PREFIX}billing-total`;

        const totalMinutesLabel = document.createElement('div');
        totalMinutesLabel.className = `${PREFIX}billing-item-label`;
        totalMinutesLabel.textContent = t('totalMinutes');

        const totalMinutesValue = document.createElement('div');
        totalMinutesValue.id = `${PREFIX}google-total-minutes`;
        totalMinutesValue.textContent = billing.google.totalMinutes.toFixed(2);

        totalMinutesItem.appendChild(totalMinutesLabel);
        totalMinutesItem.appendChild(totalMinutesValue);

        googleItems.appendChild(totalMinutesItem);

        googleSection.appendChild(googleTitle);
        googleSection.appendChild(googleItems);

        // Секция статистики GPT
        const gptSection = document.createElement('div');
        gptSection.className = `${PREFIX}billing-section`;

        const gptTitle = document.createElement('h3');
        gptTitle.textContent = 'GPT Tokens';

        const gptItems = document.createElement('div');

        // Входящие токены GPT
        const gptInTokensItem = document.createElement('div');
        gptInTokensItem.className = `${PREFIX}billing-item`;

        const gptInTokensLabel = document.createElement('div');
        gptInTokensLabel.className = `${PREFIX}billing-item-label`;
        gptInTokensLabel.textContent = t('inTokens');

        const gptInTokensValue = document.createElement('div');
        gptInTokensValue.id = `${PREFIX}gpt-in-tokens`;
        gptInTokensValue.textContent = billing.gpt.inputTokens.toLocaleString();

        gptInTokensItem.appendChild(gptInTokensLabel);
        gptInTokensItem.appendChild(gptInTokensValue);

        // Исходящие токены GPT
        const gptOutTokensItem = document.createElement('div');
        gptOutTokensItem.className = `${PREFIX}billing-item`;

        const gptOutTokensLabel = document.createElement('div');
        gptOutTokensLabel.className = `${PREFIX}billing-item-label`;
        gptOutTokensLabel.textContent = t('outTokens');

        const gptOutTokensValue = document.createElement('div');
        gptOutTokensValue.id = `${PREFIX}gpt-out-tokens`;
        gptOutTokensValue.textContent = billing.gpt.outputTokens.toLocaleString();

        gptOutTokensItem.appendChild(gptOutTokensLabel);
        gptOutTokensItem.appendChild(gptOutTokensValue);

        // Всего токенов GPT
        const gptTotalTokensItem = document.createElement('div');
        gptTotalTokensItem.className = `${PREFIX}billing-item ${PREFIX}billing-total`;

        const gptTotalTokensLabel = document.createElement('div');
        gptTotalTokensLabel.className = `${PREFIX}billing-item-label`;
        gptTotalTokensLabel.textContent = t('totalTokens');

        const gptTotalTokensValue = document.createElement('div');
        gptTotalTokensValue.id = `${PREFIX}gpt-total-tokens`;
        gptTotalTokensValue.textContent = billing.gpt.totalTokens.toLocaleString();

        gptTotalTokensItem.appendChild(gptTotalTokensLabel);
        gptTotalTokensItem.appendChild(gptTotalTokensValue);

        gptItems.appendChild(gptInTokensItem);
        gptItems.appendChild(gptOutTokensItem);
        gptItems.appendChild(gptTotalTokensItem);

        gptSection.appendChild(gptTitle);
        gptSection.appendChild(gptItems);

        // Секция статистики Gemini
        const geminiSection = document.createElement('div');
        geminiSection.className = `${PREFIX}billing-section`;

        const geminiTitle = document.createElement('h3');
        geminiTitle.textContent = 'Gemini Tokens';

        const geminiItems = document.createElement('div');

        // Входящие токены Gemini
        const geminiInTokensItem = document.createElement('div');
        geminiInTokensItem.className = `${PREFIX}billing-item`;

        const geminiInTokensLabel = document.createElement('div');
        geminiInTokensLabel.className = `${PREFIX}billing-item-label`;
        geminiInTokensLabel.textContent = t('inTokens');

        const geminiInTokensValue = document.createElement('div');
        geminiInTokensValue.id = `${PREFIX}gemini-in-tokens`;
        geminiInTokensValue.textContent = billing.gemini.inputTokens.toLocaleString();

        geminiInTokensItem.appendChild(geminiInTokensLabel);
        geminiInTokensItem.appendChild(geminiInTokensValue);

        // Исходящие токены Gemini (продолжение)
        const geminiOutTokensItem = document.createElement('div');
        geminiOutTokensItem.className = `${PREFIX}billing-item`;

        const geminiOutTokensLabel = document.createElement('div');
        geminiOutTokensLabel.className = `${PREFIX}billing-item-label`;
        geminiOutTokensLabel.textContent = t('outTokens');

        const geminiOutTokensValue = document.createElement('div');
        geminiOutTokensValue.id = `${PREFIX}gemini-out-tokens`;
        geminiOutTokensValue.textContent = billing.gemini.outputTokens.toLocaleString();

        geminiOutTokensItem.appendChild(geminiOutTokensLabel);
        geminiOutTokensItem.appendChild(geminiOutTokensValue);

        // Всего токенов Gemini
        const geminiTotalTokensItem = document.createElement('div');
        geminiTotalTokensItem.className = `${PREFIX}billing-item ${PREFIX}billing-total`;

        const geminiTotalTokensLabel = document.createElement('div');
        geminiTotalTokensLabel.className = `${PREFIX}billing-item-label`;
        geminiTotalTokensLabel.textContent = t('totalTokens');

        const geminiTotalTokensValue = document.createElement('div');
        geminiTotalTokensValue.id = `${PREFIX}gemini-total-tokens`;
        geminiTotalTokensValue.textContent = billing.gemini.totalTokens.toLocaleString();

        geminiTotalTokensItem.appendChild(geminiTotalTokensLabel);
        geminiTotalTokensItem.appendChild(geminiTotalTokensValue);

        geminiItems.appendChild(geminiInTokensItem);
        geminiItems.appendChild(geminiOutTokensItem);
        geminiItems.appendChild(geminiTotalTokensItem);

        geminiSection.appendChild(geminiTitle);
        geminiSection.appendChild(geminiItems);

        // Добавляем все секции в контейнер статистики
        billingStats.appendChild(openaiSection);
        billingStats.appendChild(googleSection);
        billingStats.appendChild(gptSection);
        billingStats.appendChild(geminiSection);

        // Кнопка сброса статистики
        const resetBillingButton = document.createElement('button');
        resetBillingButton.textContent = t('resetBilling');
        resetBillingButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        resetBillingButton.onclick = () => {
            if (confirm('Вы уверены, что хотите сбросить всю статистику использования API?')) {
                resetBillingStats();
                // Обновляем отображение
                updateBillingDisplay();
            }
        };

        billingContent.appendChild(billingStats);
        billingContent.appendChild(resetBillingButton);

        // Добавляем обработчик для вкладки статистики (обновление при открытии)
        billingTab.addEventListener('click', () => {
            updateBillingDisplay();
        });


        // Главные контролы внизу окна (фиксированное положение)
        const buttonGroup = document.createElement('div');
        buttonGroup.className = `${PREFIX}button-footer`;

        const startButton = document.createElement('button');
        startButton.textContent = t('startRecording');
        startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
        startButton.id = `${PREFIX}start-recording`;

        // Индикатор записи
        const recordingIndicator = document.createElement('div');
        recordingIndicator.className = `${PREFIX}recording-indicator`;
        recordingIndicator.style.display = 'none';

        const indicatorDot = document.createElement('div');
        indicatorDot.className = `${PREFIX}recording-indicator-dot`;

        const indicatorText = document.createElement('span');
        indicatorText.textContent = t('webAPI'); // "Веб API"

        recordingIndicator.appendChild(indicatorDot);
        recordingIndicator.appendChild(indicatorText);

        // Селектор языка
        const languageSelect = document.createElement('select');
        languageSelect.className = `${PREFIX}btn ${PREFIX}btn-secondary`;

        // Добавляем языки в селектор
        const languages = [{
                code: 'ru-RU',
                name: 'Русский'
            },
            {
                code: 'uk-UA',
                name: 'Українська'
            },
            {
                code: 'cs-CZ',
                name: 'Čeština'
            },
            {
                code: 'en-US',
                name: 'English (US)'
            },
            {
                code: 'en-GB',
                name: 'English (UK)'
            }
        ];

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            if (lang.code === settings.language) {
                option.selected = true;
            }
            languageSelect.appendChild(option);
        });

        // При изменении языка сохраняем настройку и обновляем язык интерфейса
        // Улучшенная функция обновления интерфейса при смене языка
        languageSelect.onchange = () => {
            settings.language = languageSelect.value;
            GM_setValue('language', settings.language);
            currentUILang = settings.language;

            // Обновляем текст элементов интерфейса
            title.textContent = t('title');
            notepadTab.textContent = t('notepadTab');
            savedTab.textContent = t('savedTab');
            aiTab.textContent = t('aiTab');
            billingTab.textContent = t('billingTab');

            // Обновляем текст всех кнопок в блокноте
            const copyCloseBtn = document.getElementById(`${PREFIX}copy-close-button`);
            if (copyCloseBtn) {
                copyCloseBtn.textContent = getCopyCloseText();
            }

            const copyBtn = document.getElementById(`${PREFIX}copy-button`);
            if (copyBtn) {
                copyBtn.textContent = t('copyText');
            }

            const clearBtn = document.getElementById(`${PREFIX}clear-button`);
            if (clearBtn) {
                clearBtn.textContent = t('clearNotepad');
            }

            const sendToAIBtn = document.getElementById(`${PREFIX}send-to-ai-button`);
            if (sendToAIBtn) {
                sendToAIBtn.textContent = t('sendToAI');
            }

            // Обновляем текст кнопок в AI блоке
            const aiCopyBtn = document.querySelector(`.${PREFIX}ai-content .${PREFIX}btn-secondary`);
            if (aiCopyBtn) {
                aiCopyBtn.textContent = t('copyText');
            }

            const aiClearBtn = document.querySelector(`.${PREFIX}ai-content .${PREFIX}btn-danger`);
            if (aiClearBtn) {
                aiClearBtn.textContent = t('clearAI');
            }

            // Обновляем главные кнопки управления записью
            const startBtn = document.getElementById(`${PREFIX}start-recording`);
            if (startBtn) {
                startBtn.textContent = isRecording ? t('stopRecording') : t('startRecording');
            }

            const pauseBtn = document.getElementById(`${PREFIX}pause-recording`);
            if (pauseBtn) {
                pauseBtn.textContent = isPaused ? t('continueRecording') : t('pauseRecording');
                // Дополнительно проверяем отображение кнопки
                pauseBtn.style.display = isRecording ? 'inline-block' : 'none';
            }

            // Обновляем текст заголовков и меток в блоке статистики
            const openaiTitle = document.querySelector(`.${PREFIX}billing-section h3:first-of-type`);
            if (openaiTitle) {
                openaiTitle.textContent = t('openaiTokens');
            }

            // Обновляем все метки в секции статистики
            const billingLabels = document.querySelectorAll(`.${PREFIX}billing-item-label`);
            billingLabels.forEach(label => {
                if (label.textContent.includes('Входящие') || label.textContent.includes('Input')) {
                    label.textContent = t('inTokens');
                } else if (label.textContent.includes('Исходящие') || label.textContent.includes('Output')) {
                    label.textContent = t('outTokens');
                } else if (label.textContent.includes('Всего токенов') || label.textContent.includes('Total tokens')) {
                    label.textContent = t('totalTokens');
                } else if (label.textContent.includes('Всего минут') || label.textContent.includes('Total minutes')) {
                    label.textContent = t('totalMinutes');
                }
            });

            // Обновляем секции Gemini и GPT
            const geminiHeader = document.querySelector(`h3:contains('Gemini')`);
            if (geminiHeader) {
                geminiHeader.textContent = t('geminiTokens');
            }

            const gptHeader = document.querySelector(`h3:contains('GPT')`);
            if (gptHeader) {
                gptHeader.textContent = t('gptTokens');
            }

            // Обновляем остальные кнопки
            clearSavedButton.textContent = t('clearMemory');
            settingsButton.textContent = t('settings');
            closeModalButton.textContent = t('close');
            resetBillingButton.textContent = t('resetBilling');

            // Обновляем индикатор записи
            const indicatorTextElement = document.querySelector(`.${PREFIX}recording-indicator span`);
            if (indicatorTextElement) {
                indicatorTextElement.textContent = settings.forceAPI === 'google' ? t('cloudAPI') : t('webAPI');
            }

            // Обновляем список сохраненных текстов
            const savedList = document.getElementById(`${PREFIX}saved-texts-list`);
            if (savedList) {
                updateSavedTextsList(savedList);
            }
        };
        const settingsButton = document.createElement('button');
        settingsButton.textContent = t('settings');
        settingsButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        settingsButton.onclick = () => {
            showSettingsModal(modal);
        };

        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = t('close');
        closeModalButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        closeModalButton.onclick = () => {
            // Останавливаем запись, если она активна
            if (isRecording) {
                stopRecording();
            }

            // Сохраняем текущий текст перед закрытием
            saveCurrentText();

            // Безопасно удаляем элементы, проверяя их существование и родительские элементы
            const modalElement = document.querySelector(`.${PREFIX}speech-modal`);
            const overlayElement = document.querySelector(`.${PREFIX}overlay`);

            if (modalElement && modalElement.parentNode) {
                modalElement.parentNode.removeChild(modalElement);
            }

            if (overlayElement && overlayElement.parentNode) {
                overlayElement.parentNode.removeChild(overlayElement);
            }
        };
        // Добавляем кнопки в футер в правильном порядке (только один раз)
        buttonGroup.appendChild(startButton);
        buttonGroup.appendChild(recordingIndicator);
        buttonGroup.appendChild(languageSelect);
        buttonGroup.appendChild(settingsButton);
        // buttonGroup.appendChild(aiSettingsButton);
        buttonGroup.appendChild(closeModalButton);

        // Содержимое таба инструкций
        const instructionsContent = document.createElement('div');
        instructionsContent.className = `${PREFIX}tab-content`;
        instructionsContent.id = `${PREFIX}instructions-content`;

        // Содержимое инструкций (будет заполнено в зависимости от языка)
        safeHTML(instructionsContent, 'innerHTML', getInstructionsContent());

        // Обработка переключения табов
        const tabs = [notepadTab, savedTab, aiTab, instructionsTab, billingTab];
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Удаляем активный класс у всех табов
                tabs.forEach(t => t.classList.remove(`${PREFIX}active`));
                // Добавляем активный класс текущему табу
                tab.classList.add(`${PREFIX}active`);

                // Скрываем все содержимое табов
                document.querySelectorAll(`.${PREFIX}tab-content`).forEach(tc => {
                    tc.classList.remove(`${PREFIX}active`);
                });

                // Показываем содержимое выбранного таба
                document.getElementById(tab.dataset.target).classList.add(`${PREFIX}active`);
            });
        });

        // Собираем модальное окно
        modal.appendChild(header);
        modal.appendChild(tabContainer);

        // Добавляем содержимое табов
        modal.appendChild(notepadContent);
        modal.appendChild(savedContent);
        modal.appendChild(aiContent);
        modal.appendChild(instructionsContent); // Добавляем вкладку инструкций
        modal.appendChild(billingContent);

        // Добавляем футер с кнопками
        modal.appendChild(buttonGroup);

        document.body.appendChild(overlay);
        document.body.appendChild(modal);
        // Создаем фиксированные кнопки записи
        createFixedRecordingControls();
        // Настраиваем функционал распознавания речи
        setupSpeechRecognition(startButton, notepad, recordingIndicator, indicatorText);

        return modal;
    }

    // Функция для получения текста из блокнота
    function getNotepadText(notepad) {
        return Array.from(notepad.childNodes)
            .map(node => node.textContent || '')
            .join('\n');
    }

    // Функция сохранения текущего текста
    function saveCurrentText() {
        if (currentText.length > 0 || currentLine.trim() !== '' || currentTextBuffer.length > 0) {
            const fullText = [...currentText];

            // Добавляем текущую строку, если она не пустая
            if (currentLine.trim() !== '') {
                fullText.push(currentLine);
            }

            // Добавляем текст из буфера, если он есть
            if (currentTextBuffer.length > 0) {
                fullText.push(currentTextBuffer.join(' '));
            }

            // Добавляем только если есть текст
            if (fullText.length > 0) {
                savedTexts.push({
                    date: new Date().toLocaleString(),
                    text: fullText.join('\n')
                });
                GM_setValue('savedTexts', savedTexts);
            }

            // Сбрасываем текущий текст
            currentText = [];
            currentLine = '';
            currentTextBuffer = [];
        }
    }

    // Обновление списка сохраненных текстов
    function updateSavedTextsList(container) {

        safeHTML(container, 'innerHTML', '');
        if (savedTexts.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = t('noSavedTexts');
            emptyMessage.style.padding = '10px';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.color = '#666';
            container.appendChild(emptyMessage);
            return;
        }

        savedTexts.forEach((item, index) => {
            const savedTextItem = document.createElement('div');
            savedTextItem.style.marginBottom = '20px';
            savedTextItem.style.borderBottom = '1px solid #eee';
            savedTextItem.style.paddingBottom = '10px';

            const dateHeader = document.createElement('div');
            dateHeader.textContent = `${t('recordFrom')} ${item.date}`;
            dateHeader.style.fontWeight = 'bold';
            dateHeader.style.marginBottom = '5px';
            dateHeader.style.color = '#4285f4';

            const textContent = document.createElement('div');
            textContent.textContent = item.text;
            textContent.style.whiteSpace = 'pre-wrap';

            const deleteButton = document.createElement('button');
            deleteButton.textContent = t('delete');
            deleteButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
            deleteButton.style.marginTop = '5px';
            deleteButton.style.padding = '4px 8px';
            deleteButton.style.fontSize = '12px';
            deleteButton.onclick = () => {
                savedTexts.splice(index, 1);
                GM_setValue('savedTexts', savedTexts);
                updateSavedTextsList(container);
            };

            savedTextItem.appendChild(dateHeader);
            savedTextItem.appendChild(textContent);
            savedTextItem.appendChild(deleteButton);
            container.appendChild(savedTextItem);
        });
    }

    // Остановка записи с освобождением ресурсов
    function stopRecording() {
        if (!isRecording) return;

        isRecording = false;
        isPaused = false;

        // Останавливаем Web Speech API
        if (window.recognition) {
            try {
                window.recognition.stop();
            } catch (e) {
                console.warn('Ошибка при остановке recognition:', e);
            }
        }

        // Останавливаем аудиопоток и освобождаем ресурсы
        if (window.speechStream) {
            window.speechStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
        }

        // Отключаем процессор
        if (window.speechProcessor) {
            try {
                window.speechProcessor.disconnect();
            } catch (e) {
                console.warn('Ошибка при отключении speechProcessor:', e);
            }
            window.speechProcessor.onaudioprocess = null;
        }

        // Отключаем gainNode
        if (window.gainNode) {
            try {
                window.gainNode.disconnect();
            } catch (e) {
                console.warn('Ошибка при отключении gainNode:', e);
            }
            window.gainNode = null;
        }

        // Отключаем analyzer
        if (window.analyzer) {
            try {
                window.analyzer.disconnect();
            } catch (e) {
                console.warn('Ошибка при отключении analyzer:', e);
            }
            window.analyzer = null;
        }

        // Закрываем аудиоконтекст
        if (window.audioContext && window.audioContext.state !== 'closed') {
            try {
                window.audioContext.close().catch(e => {
                    console.warn('Не удалось закрыть аудиоконтекст:', e);
                });
            } catch (e) {
                console.warn('Ошибка при закрытии аудиоконтекста:', e);
            }
        }

        // Очищаем ссылки для сборщика мусора
        window.speechStream = null;
        window.speechProcessor = null;
        window.audioContext = null;
        window.recognition = null;

        // Обновляем статистику
        if (window.recordingStartTime) {
            const recordingEndTime = new Date();
            const recordingDuration = (recordingEndTime - window.recordingStartTime) / 1000;
            updateGoogleStats(recordingDuration);
            window.recordingStartTime = null;
        }

        // Сохраняем текст и очищаем буферы
        if (currentLine.trim() !== '') {
            currentText.push(currentLine);
            currentLine = '';
        }

        if (currentTextBuffer.length > 0) {
            currentText.push(currentTextBuffer.join(' '));
            currentTextBuffer = [];
        }

        // Сбрасываем состояние обработки команд
        if (commandCleanupTimer) {
            clearTimeout(commandCleanupTimer);
            commandCleanupTimer = null;
        }
        pendingCommandCleanup = false;
        lastProcessedText = '';
        commandActivated = false;


        // Скрываем элементы интерфейса
        const pauseButton = document.getElementById(`${PREFIX}pause-recording`);
        if (pauseButton) {
            pauseButton.style.display = 'none';
        }

        // Скрываем индикатор громкости
        const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
        if (volumeMeter) {
            volumeMeter.style.display = 'none';
        }

        // Обновляем фиксированные кнопки управления
        updateFixedControlsState();
        // Очищаем очередь команд при остановке записи
        processedCommands = [];
    }

    // Добавим переменную для хранения состояния паузы
    let isPaused = false;

    function setupSpeechRecognition(startButton, notepad, recordingIndicator, indicatorText) {
        // Обновляем содержимое блокнота с новыми словами
        function appendWords(text) {
            if (settings.recordingStyle === 'byWord') {
                // Разбиваем текст на слова
                const words = text.split(/\s+/);

                // Сохраняем предыдущий буфер для сравнения
                const oldBuffer = [...currentTextBuffer];

                // Обновляем буфер слов
                currentTextBuffer = words;

                // Создаем или обновляем строку в блокноте
                if (notepad.childNodes.length === 0) {
                    const line = document.createElement('div');
                    line.className = `${PREFIX}notepad-line`;
                    line.textContent = words.join(' ');
                    notepad.appendChild(line);
                } else {
                    const lastLine = notepad.lastChild;
                    // Если есть новые слова, добавляем анимацию для них
                    if (oldBuffer.length < words.length) {
                        // Высвечиваем последнее слово на короткий период
                        const span = document.createElement('span');
                        span.textContent = words[words.length - 1];
                        span.style.backgroundColor = '#e8f0fe';
                        span.style.transition = 'background-color 1s';
                        safeHTML(lastLine, 'innerHTML', words.slice(0, -1).join(' ') + ' ');

                        lastLine.appendChild(span);

                        setTimeout(() => {
                            span.style.backgroundColor = 'transparent';
                        }, 500);
                    } else {
                        lastLine.textContent = words.join(' ');
                    }
                }

                notepad.scrollTop = notepad.scrollHeight;
            } else {
                // Режим по фразам - просто обновляем текущую строку
                updateNotepadLine(text);
            }
        }

        // Добавляем или обновляем текущую строку в блокноте
        function updateNotepadLine(text) {
            currentLine = text;

            // Если блокнот пустой, добавляем первую строку
            if (notepad.childNodes.length === 0) {
                const line = document.createElement('div');
                line.className = `${PREFIX}notepad-line`;
                line.textContent = text;
                notepad.appendChild(line);
            } else {
                // Иначе обновляем последнюю строку
                const lastLine = notepad.lastChild;

                // ИСПРАВЛЕНИЕ: Добавляем пробел перед новым текстом,
                // если текущая строка не пустая
                if (lastLine.textContent.trim() !== '') {
                    lastLine.textContent += ' ' + text;
                } else {
                    lastLine.textContent = text;
                }
            }

            notepad.scrollTop = notepad.scrollHeight;
        }

        // Создаем новую строку в блокноте
        function addNewLine() {
            if (currentLine.trim() !== '') {
                currentText.push(currentLine);
                currentLine = '';

                // Если в режиме по словам, сохраняем буфер и очищаем его
                if (settings.recordingStyle === 'byWord' && currentTextBuffer.length > 0) {
                    currentText.push(currentTextBuffer.join(' '));
                    currentTextBuffer = [];
                }

                const line = document.createElement('div');
                line.className = `${PREFIX}notepad-line`;
                notepad.appendChild(line);
                notepad.scrollTop = notepad.scrollHeight;
            }
        }

        // Подготавливаем текущий текст и строку
        currentText = [];
        currentLine = '';
        currentTextBuffer = [];

        // Очищаем блокнот
        safeHTML(notepad, 'innerHTML', '');
        // Создаем кнопку для паузы/продолжения
        const pauseButton = document.createElement('button');
        pauseButton.textContent = t('pauseRecording');
        pauseButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        pauseButton.style.display = 'none'; // Скрыта по умолчанию - это важно!
        pauseButton.id = `${PREFIX}pause-recording`;

        // Добавляем кнопку паузы рядом с основной кнопкой
        startButton.parentNode.insertBefore(pauseButton, startButton.nextSibling);

        // Функция для управления состоянием паузы
        function togglePause() {
            if (isPaused) {
                // Очищаем очередь команд при возобновлении записи
                processedCommands = [];

                // Возобновляем запись
                isPaused = false;

                if (window.recognition) {
                    try {
                        window.recognition.start();
                    } catch (e) {
                        console.warn('Ошибка при запуске recognition после паузы:', e);
                    }
                } else if (window.speechStream) {
                    // Для Google API - возобновляем обработку
                    if (window.speechProcessor && window.audioContext) {
                        try {
                            window.speechProcessor.connect(window.audioContext.destination);
                        } catch (e) {
                            console.warn('Ошибка при подключении процессора после паузы:', e);
                        }
                    }
                }

                // НОВОЕ: Добавляем пробел перед следующим текстом
                if (currentLine.trim() !== '') {
                    currentLine += ' ';
                }

                // Меняем текст кнопки на "Пауза"
                pauseButton.textContent = t('pauseRecording');

                // Делаем индикатор полностью видимым
                indicatorText.parentNode.style.opacity = '1';

                // Показываем индикатор громкости
                const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
                if (volumeMeter) {
                    volumeMeter.style.display = 'block';
                }
                updateFixedControlsState();
            } else {
                // Ставим на паузу
                isPaused = true;

                if (window.recognition) {
                    try {
                        window.recognition.stop();
                    } catch (e) {
                        console.warn('Ошибка при остановке recognition для паузы:', e);
                    }
                } else if (window.speechProcessor) {
                    // Для Google API - приостанавливаем обработку
                    try {
                        window.speechProcessor.disconnect();
                    } catch (e) {
                        console.warn('Ошибка при отключении процессора для паузы:', e);
                    }
                }

                // Меняем текст кнопки на "Продолжить"
                pauseButton.textContent = t('continueRecording');

                // Делаем индикатор полупрозрачным
                indicatorText.parentNode.style.opacity = '0.5';

                // Скрываем индикатор громкости
                const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
                if (volumeMeter) {
                    volumeMeter.style.display = 'none';
                }
                updateFixedControlsState();
            }
        }


        // Обработчик нажатия на кнопку паузы
        pauseButton.onclick = togglePause;

        // Настраиваем функционал браузерного Speech API
        function setupBrowserSpeechAPI() {
            window.recognition = new webkitSpeechRecognition();
            window.recognition.continuous = true;
            window.recognition.interimResults = true;
            window.recognition.lang = settings.language;

            // Создаем индикатор громкости без привязки к аудиоконтексту
            createVolumeMeter();
            const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);

            // Основной обработчик результатов распознавания - НЕ ИЗМЕНЯЕМ
            window.recognition.onresult = (event) => {
                // Если на паузе, не обрабатываем результаты
                if (isPaused) return;

                // Отображаем индикатор громкости при получении результатов
                if (volumeMeter) volumeMeter.style.display = 'block';

                let currentTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;

                    if (event.results[i].isFinal) {
                        // Получаем текущий язык из настроек
                        const lang = settings.language;
                        const lowerText = transcript.toLowerCase();

                        // Получаем активационные фразы для текущего языка
                        const activationPhrases = {
                            'ru-RU': ['помощник', 'компьютер', 'ассистент', 'команда'],
                            'en-US': ['assistant', 'computer', 'command'],
                            'uk-UA': ['помічник', 'комп\'ютер', 'асистент', 'команда'],
                            'cs-CZ': ['asistent', 'počítač', 'příkaz']
                        }[lang] || ['помощник', 'компьютер', 'ассистент', 'команда']; // Дефолт на русский

                        // Получаем команды для текущего языка
                        const commands = VOICE_COMMANDS[lang] || VOICE_COMMANDS['ru-RU'];

                        // Проверяем наличие пользовательских команд
                        const customCommands = GM_getValue('customVoiceCommands', {});
                        const langCommands = customCommands[lang] ? {...commands, ...customCommands[lang]} : commands;

                        // Ищем активационные фразы
                        let isCommand = false;
                        let processedText = transcript;

                        for (const phrase of activationPhrases) {
                            if (lowerText.includes(phrase)) {
                                // Нашли активационную фразу
                                const phraseIndex = lowerText.indexOf(phrase);
                                const beforePhrase = transcript.substring(0, phraseIndex).trim();
                                const afterPhrase = lowerText.substring(phraseIndex + phrase.length).trim();
                                const originalAfterPhrase = transcript.substring(phraseIndex + phrase.length).trim();

                                // Если после активационной фразы ничего нет
                                if (!afterPhrase) {
                                    processedText = beforePhrase;
                                    isCommand = true;
                                    break;
                                }

                                // Проверяем наличие команд после активационной фразы
                                let commandFound = false;

                                for (const [cmd, action] of Object.entries(langCommands)) {
                                    if (afterPhrase === cmd ||
                                        afterPhrase.startsWith(cmd + ' ') ||
                                        afterPhrase.includes(' ' + cmd + ' ') ||
                                        afterPhrase.endsWith(' ' + cmd)) {

                                        // Нашли команду
                                        commandFound = true;

                                        // Выполняем действие для команды
                                        executeVoiceCommand(action);

                                        // Показываем индикатор команды
                                        showCommandIndicator(cmd);

                                        // Находим индекс команды в тексте после активационной фразы
                                        let cmdIndex = -1;
                                        if (afterPhrase === cmd) {
                                            cmdIndex = 0;
                                        } else if (afterPhrase.startsWith(cmd + ' ')) {
                                            cmdIndex = 0;
                                        } else if (afterPhrase.includes(' ' + cmd + ' ')) {
                                            cmdIndex = afterPhrase.indexOf(' ' + cmd + ' ') + 1;
                                        } else if (afterPhrase.endsWith(' ' + cmd)) {
                                            cmdIndex = afterPhrase.lastIndexOf(' ' + cmd) + 1;
                                        }

                                        if (cmdIndex === -1) continue;

                                        // Получаем текст после команды
                                        const cmdEnd = cmdIndex + cmd.length;
                                        const afterCmd = originalAfterPhrase.substring(cmdEnd).trim();

                                        // Для команд пунктуации заменяем команду знаком пунктуации
                                        if (['period', 'comma', 'questionMark', 'exclamationMark', 'colon'].includes(action)) {
                                            const punctuation = {
                                                'period': '.',
                                                'comma': ',',
                                                'questionMark': '?',
                                                'exclamationMark': '!',
                                                'colon': ':'
                                            }[action];

                                            // Формируем результат: текст до + знак + текст после
                                            if (beforePhrase) {
                                                processedText = beforePhrase + ' ' + punctuation;
                                            } else {
                                                processedText = punctuation;
                                            }

                                            if (afterCmd) {
                                                processedText += ' ' + afterCmd;
                                            }
                                        } else {
                                            // Для других команд просто удаляем команду с активационной фразой
                                            processedText = beforePhrase ? beforePhrase : '';
                                            if (afterCmd) {
                                                if (processedText) processedText += ' ';
                                                processedText += afterCmd;
                                            }
                                        }

                                        break;
                                    }
                                }

                                // Если активационная фраза найдена, но команда не распознана
                                if (!commandFound && afterPhrase) {
                                    // Это специальная инструкция - добавляем в фигурных скобках
                                    processedText = beforePhrase ? (beforePhrase + ' ') : '';
                                    processedText += `{${originalAfterPhrase}}`;
                                }

                                isCommand = true;
                                break;
                            }
                        }

                        // Добавляем обработанный текст
                        if (isCommand) {
                            if (processedText && processedText.trim()) {
                                finalTranscript += processedText + ' ';
                            }
                        } else {
                            finalTranscript += transcript + ' ';
                        }
                    } else {
                        currentTranscript += transcript + ' ';
                    }
                }

                // Обработка в зависимости от режима распознавания
                if (settings.recordingStyle === 'byWord') {
                    // Режим по словам - обновляем буфер только если есть текст для добавления
                    if (finalTranscript) {
                        // Разбиваем на слова и добавляем в буфер
                        const newWords = finalTranscript.split(/\s+/).filter(w => w.trim());
                        if (newWords.length > 0) {
                            currentTextBuffer = currentTextBuffer.concat(newWords);

                            // Обновляем отображение
                            const line = notepad.lastChild || document.createElement('div');
                            if (!line.parentNode) {
                                line.className = `${PREFIX}notepad-line`;
                                notepad.appendChild(line);
                            }
                            line.textContent = currentTextBuffer.join(' ');
                        }
                    }

                    if (currentTranscript) {
                        // Временное отображение текущего распознавания
                        const line = notepad.lastChild || document.createElement('div');
                        if (!line.parentNode) {
                            line.className = `${PREFIX}notepad-line`;
                            notepad.appendChild(line);
                        }
                        line.textContent = currentTextBuffer.join(' ') + (currentTextBuffer.length > 0 ? ' ' : '') + currentTranscript;
                    }
                } else {
                    // Режим по фразам
                    if (finalTranscript) {
                        // Добавляем только если есть что добавлять
                        currentLine += finalTranscript;

                        // Проверяем на знаки пунктуации для новой строки
                        if (/[.!?]$/.test(finalTranscript)) {
                            // Добавляем текущую строку в массив и создаем новую
                            currentText.push(currentLine);
                            currentLine = '';

                            // Создаем новый элемент строки
                            const newLine = document.createElement('div');
                            newLine.className = `${PREFIX}notepad-line`;
                            notepad.appendChild(newLine);
                        } else {
                            // Обновляем текущую строку
                            const lastLine = notepad.lastChild || document.createElement('div');
                            if (!lastLine.parentNode) {
                                lastLine.className = `${PREFIX}notepad-line`;
                                notepad.appendChild(lastLine);
                            }
                            lastLine.textContent = currentLine;
                        }
                    }

                    if (currentTranscript) {
                        // Временное отображение текущего распознавания
                        const lastLine = notepad.lastChild || document.createElement('div');
                        if (!lastLine.parentNode) {
                            lastLine.className = `${PREFIX}notepad-line`;
                            notepad.appendChild(lastLine);
                        }
                        lastLine.textContent = currentLine + (currentLine ? ' ' : '') + currentTranscript;
                    }
                }

                notepad.scrollTop = notepad.scrollHeight;
            };
            // После обновления блокнота
            scheduleCommandCleanup();
            // Упрощенный индикатор активности (мигание точки) для Web API
            let blinkInterval = null;

            window.recognition.onstart = () => {
                if (volumeMeter) volumeMeter.style.display = 'block';

                // Имитация активности микрофона путем мигания индикатора
                if (blinkInterval) clearInterval(blinkInterval);
                let level = 0;
                const volumeLevel = volumeMeter.querySelector(`.${PREFIX}volume-level`);

                blinkInterval = setInterval(() => {
                    if (!isRecording || isPaused) {
                        clearInterval(blinkInterval);
                        if (volumeMeter) volumeMeter.style.display = 'none';
                        return;
                    }

                    // Имитация случайного уровня громкости
                    level = Math.random() * 60 + 10; // 10-70%
                    if (volumeLevel) volumeLevel.style.height = `${level}%`;
                }, 300);
            };

            window.recognition.onend = () => {
                // Если запись всё еще активна и не на паузе, перезапускаем
                if (isRecording && !isPaused) {
                    window.recognition.start();
                } else {
                    if (blinkInterval) {
                        clearInterval(blinkInterval);
                        blinkInterval = null;
                    }
                    if (volumeMeter) volumeMeter.style.display = 'none';
                }
            };

            window.recognition.onerror = (event) => {
                console.error('Ошибка распознавания речи:', event.error);
            };
        }

        // Создание индикатора громкости
        function createVolumeMeter() {
            // Удаляем старый индикатор, если он есть
            const oldMeter = document.querySelector(`.${PREFIX}volume-meter`);
            if (oldMeter && oldMeter.parentNode) {
                oldMeter.parentNode.removeChild(oldMeter);
            }

            // Создаем новый индикатор
            const volumeMeter = document.createElement('div');
            volumeMeter.className = `${PREFIX}volume-meter`;
            volumeMeter.style.width = '20px';
            volumeMeter.style.height = '100px';
            volumeMeter.style.backgroundColor = '#f0f0f0';
            volumeMeter.style.border = '1px solid #ccc';
            volumeMeter.style.position = 'fixed';
            volumeMeter.style.bottom = '80px';
            volumeMeter.style.right = '20px';
            volumeMeter.style.zIndex = '2147483640';
            volumeMeter.style.borderRadius = '10px';
            volumeMeter.style.overflow = 'hidden';
            volumeMeter.style.display = 'none'; // По умолчанию скрыт

            const volumeLevel = document.createElement('div');
            volumeLevel.className = `${PREFIX}volume-level`;
            volumeLevel.style.width = '100%';
            volumeLevel.style.backgroundColor = '#4285f4';
            volumeLevel.style.position = 'absolute';
            volumeLevel.style.bottom = '0';
            volumeLevel.style.transition = 'height 0.1s ease-out';
            volumeLevel.style.height = '0%';

            volumeMeter.appendChild(volumeLevel);
            document.body.appendChild(volumeMeter);

            return volumeMeter; // Теперь возвращаем созданный элемент
        }

        // Настраиваем функционал Google Speech API
        function setupGoogleSpeechRecording(notepad) {
            if (!settings.googleSpeechApiKey) {
                alert(format(t('noKeySpecified'), 'Google Speech'));
                isRecording = false;
                pauseButton.style.display = 'none';
                startButton.textContent = t('startRecording');
                startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
                recordingIndicator.style.display = 'none';
                return;
            }

            // Засекаем время начала записи для статистики
            window.recordingStartTime = new Date();

            try {
                // Создаем аудиоконтекст
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                window.audioContext = new AudioContext();

                // Показываем индикатор громкости - сначала проверяем, существует ли он
                const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
                if (!volumeMeter) {
                    // Если индикатора нет, создаем его
                    createVolumeMeter();
                }

                // Теперь снова ищем индикатор и его уровень
                const updatedVolumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
                if (updatedVolumeMeter) {
                    updatedVolumeMeter.style.display = 'block';
                    const volumeLevel = updatedVolumeMeter.querySelector(`.${PREFIX}volume-level`);

                    // Имитация активности индикатора громкости
                    let mockVolumeInterval = setInterval(() => {
                        if (!isRecording || isPaused) {
                            clearInterval(mockVolumeInterval);
                            updatedVolumeMeter.style.display = 'none';
                            return;
                        }

                        // Случайный уровень для визуальной обратной связи
                        const level = Math.random() * 60 + 10; // 10-70%
                        if (volumeLevel) volumeLevel.style.height = `${level}%`;
                    }, 300);
                }

                // Получаем доступ к микрофону с упрощенными параметрами
                navigator.mediaDevices.getUserMedia({
                        audio: true
                    })
                    .then(stream => {
                        window.speechStream = stream;
                        const source = window.audioContext.createMediaStreamSource(stream);

                        // Создаем простой процессор обработки без сложных узлов
                        const processor = window.audioContext.createScriptProcessor(16384, 1, 1);
                        window.speechProcessor = processor;

                        const audioChunks = [];
                        let lastSendTime = Date.now();

                        // Обработчик аудиоданных
                        processor.onaudioprocess = (e) => {
                            if (!isRecording || isPaused) return;

                            const audioData = e.inputBuffer.getChannelData(0);
                            audioChunks.push(new Float32Array(audioData));

                            // Отправляем аудио каждые 3 секунды
                            const currentTime = Date.now();
                            const timeElapsed = currentTime - lastSendTime;

                            if (timeElapsed > 3000 && audioChunks.length > 0) {
                                processAudioForServer(audioChunks, notepad);
                                lastSendTime = currentTime;
                                audioChunks.length = 0; // Очищаем буфер
                            }
                        };

                        // Подключаем и запускаем процессор
                        source.connect(processor);
                        processor.connect(window.audioContext.destination);

                        // console.log('Google Speech API запись инициализирована');
                    })
                    .catch(err => {
                        console.error('Ошибка доступа к микрофону:', err);
                        alert(t('noMicAccess'));
                        isRecording = false;
                        pauseButton.style.display = 'none';
                        startButton.textContent = t('startRecording');
                        startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
                        recordingIndicator.style.display = 'none';
                    });
            } catch (err) {
                console.error('Ошибка инициализации аудио:', err);
                alert(t('errorAudioInit'));
                isRecording = false;
                pauseButton.style.display = 'none';
                startButton.textContent = t('startRecording');
                startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
                recordingIndicator.style.display = 'none';
            }
        }

        startButton.onclick = () => {
            if (!isRecording) {
                // Начинаем запись
                isRecording = true;
                isPaused = false; // Сбрасываем состояние паузы

                // Показываем кнопку паузы только при записи
                pauseButton.style.display = 'inline-block';

                // Меняем текст на кнопке и её цвет (на красный)
                startButton.textContent = t('stopRecording');
                startButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;

                // Показываем индикатор записи
                recordingIndicator.style.display = 'inline-flex';
                recordingIndicator.style.opacity = '1';

                // Выбираем API в зависимости от настроек
                if (settings.forceAPI === 'google' || (!('webkitSpeechRecognition' in window) && settings.forceAPI !== 'browser')) {
                    // Настраиваем Google API (внешний, облачный)
                    indicatorText.textContent = t('cloudAPI');
                    setupGoogleSpeechRecording(notepad); // передаем notepad как параметр
                } else {
                    // Настраиваем браузерный API (веб)
                    indicatorText.textContent = t('webAPI'); // Правильно: Web API для браузера
                    setupBrowserSpeechAPI();
                    window.recognition.start();
                }
            } else {
                // Останавливаем запись
                stopRecording();

                // Скрываем кнопку паузы при остановке записи
                pauseButton.style.display = 'none';

                // Меняем текст на кнопке и её цвет (на зелёный)
                startButton.textContent = t('startRecording');
                startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;

                // Скрываем индикатор записи
                recordingIndicator.style.display = 'none';
            }
            // Обновляем состояние фиксированных кнопок
            updateFixedControlsState();
        };

        // Инициализация распознавания речи
        if ('webkitSpeechRecognition' in window) {
            setupBrowserSpeechAPI();
        }

        // Устанавливаем начальный зелёный цвет для кнопки Старт
        startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;

        // ВАЖНО: Кнопка паузы скрыта при инициализации (запись неактивна)
        pauseButton.style.display = 'none';

        // Исправление проблемы с отображением типа API
        // Выставляем правильный текст в зависимости от настроек
        if (settings.forceAPI === 'google') {
            indicatorText.textContent = t('cloudAPI');
        } else {
            indicatorText.textContent = t('webAPI');
        }
        // Очищаем очередь команд при запуске новой сессии распознавания
        processedCommands = [];
    }

    // Функция для создания аудио Blob из буфера
    function createAudioBlob(audioChunks) {
        // Объединяем все чанки в один буфер
        const combinedBuffer = new Float32Array(audioChunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let offset = 0;
        for (const chunk of audioChunks) {
            combinedBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        // Конвертируем в WAV формат
        const wavBuffer = float32ToWav(combinedBuffer, 44100);
        return new Blob([wavBuffer], {
            type: 'audio/wav'
        });
    }

    // Конвертация Float32Array в WAV формат
    function float32ToWav(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        // RIFF идентификатор
        writeString(view, 0, 'RIFF');
        // размер файла
        view.setUint32(4, 36 + samples.length * 2, true);
        // RIFF тип
        writeString(view, 8, 'WAVE');
        // формат
        writeString(view, 12, 'fmt ');
        // длина секции формата
        view.setUint32(16, 16, true);
        // тип (1 - PCM)
        view.setUint16(20, 1, true);
        // количество каналов
        view.setUint16(22, 1, true);
        // частота дискретизации
        view.setUint32(24, sampleRate, true);
        // байт в секунду
        view.setUint32(28, sampleRate * 2, true);
        // байт на сэмпл (для всех каналов)
        view.setUint16(32, 2, true);
        // бит на сэмпл
        view.setUint16(34, 16, true);
        // данные
        writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);

        // запись данных
        floatTo16BitPCM(view, 44, samples);

        return buffer;
    }

    // Запись строки в DataView
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Конвертирование Float32 в 16-bit PCM
    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    // Обновление текста в блокноте при использовании Google API
    function updateTranscript(notepad, text) {
        const commandInfo = detectCommand(text);

        if (commandInfo.found) {
            // Если команда найдена, используем очищенный текст
            text = cleanTextFromCommands(text);

            // Если после очистки текст пустой, выходим
            if (!text.trim()) return;
        }

        if (!isRecording) return;

        // Обрабатываем текст через новую функцию обработки команд
        const processedResult = processVoiceCommand(text);

        let textToAdd = '';
        if (processedResult.processed) {
            // Команда была обработана
            textToAdd = processedResult.text || '';
            if (!textToAdd) return; // Если текст пустой, ничего не добавляем
        } else {
            // Команда не обнаружена - используем исходный текст
            textToAdd = text;
        }

        // Дальше обработка в зависимости от режима распознавания
        if (settings.recordingStyle === 'byWord') {
            appendWordsByGoogle(notepad, textToAdd);
        } else {
            // Режим по фразам
            // Остальной код без изменений
            const lastLine = notepad.lastChild || document.createElement('div');
            if (!lastLine.parentNode) {
                lastLine.className = `${PREFIX}notepad-line`;
                notepad.appendChild(lastLine);
            }

            if (currentLine.trim() !== '') {
                currentLine += ' ';
            }

            currentLine += textToAdd;
            lastLine.textContent = currentLine;

            if (/[.!?]$/.test(textToAdd)) {
                currentText.push(currentLine);
                currentLine = '';

                const newLine = document.createElement('div');
                newLine.className = `${PREFIX}notepad-line`;
                notepad.appendChild(newLine);
            }
        }

        notepad.scrollTop = notepad.scrollHeight;
    }

    // Функция для добавления слов при использовании Google API (режим по словам)
    function appendWordsByGoogle(notepad, text) {
        // Проверяем, есть ли команда в тексте
        const commandInfo = detectCommand(text);

        if (commandInfo.found) {
            // Команда найдена - используем очищенный текст
            text = cleanTextFromCommands(text);

            // Если после очистки текст пустой, выходим
            if (!text.trim()) return;
        }

        if (!text || text.trim() === '') return;

        // Сохраняем предыдущий текст для отладки
        const previousText = currentTextBuffer.join(' ');
        // console.log('Предыдущий текст:', previousText);
        // console.log('Новый текст от Google API:', text);

        // Если это сообщение об ошибке или системное сообщение, игнорируем
        if (text.includes('Запись через Google API') || text.includes('требуется настройка')) {
            return;
        }

        // ВАЖНОЕ ИСПРАВЛЕНИЕ: Не заменяем, а добавляем текст к буферу
        if (settings.recordingStyle === 'byWord') {
            // В режиме по словам сохраняем все слова
            // Разбиваем на слова
            const words = text.split(/\s+/).filter(w => w.trim() !== '');

            // Если это первое распознавание, просто сохраняем слова
            if (currentTextBuffer.length === 0) {
                currentTextBuffer = words;
            } else {
                // Добавляем новые слова к существующим
                currentTextBuffer = [...currentTextBuffer, ...words];
            }

            // Обновляем отображение в блокноте
            let lastLine = notepad.lastChild;
            if (!lastLine || !(lastLine instanceof Element)) {
                lastLine = document.createElement('div');
                lastLine.className = `${PREFIX}notepad-line`;
                notepad.appendChild(lastLine);
            }

            // Устанавливаем текст
            lastLine.textContent = currentTextBuffer.join(' ');
        } else {
            // В режиме по фразам рассматриваем каждый ответ как завершенную фразу
            if (currentLine.trim() === '') {
                // Если текущая строка пуста, используем новый текст
                currentLine = text;
            } else {
                // Иначе добавляем к существующему тексту
                currentLine += ' ' + text;
            }

            // Обновляем или создаем строку в блокноте
            let lastLine = notepad.lastChild;
            if (!lastLine || !(lastLine instanceof Element)) {
                lastLine = document.createElement('div');
                lastLine.className = `${PREFIX}notepad-line`;
                notepad.appendChild(lastLine);
            }

            // Устанавливаем текст
            lastLine.textContent = currentLine;

            // Если текст завершается знаком препинания, создаем новую строку
            if (/[.!?]$/.test(text)) {
                // Сохраняем текущую строку и создаем новую
                currentText.push(currentLine);
                currentLine = '';

                const newLine = document.createElement('div');
                newLine.className = `${PREFIX}notepad-line`;
                notepad.appendChild(newLine);
            }
        }

        // Прокручиваем до конца
        notepad.scrollTop = notepad.scrollHeight;
    }

    // Модальное окно основных настроек
    function showSettingsModal(parentModal) {
        // Удаляем предыдущее модальное окно настроек, если оно есть
        const existingModal = document.querySelector(`.${PREFIX}settings-modal`);
        const existingOverlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
        if (existingModal) document.body.removeChild(existingModal);
        if (existingOverlay) document.body.removeChild(existingOverlay);

        // Создаем оверлей только если нет родительского модального окна
        if (!parentModal) {
            const overlay = document.createElement('div');
            overlay.className = `${PREFIX}overlay`;
            document.body.appendChild(overlay);
        }

        // Создаем модальное окно настроек
        const modal = document.createElement('div');
        modal.className = `${PREFIX}settings-modal`;

        // Заголовок
        const header = document.createElement('div');
        header.className = `${PREFIX}modal-header`;

        const title = document.createElement('h2');
        title.textContent = t('settingsTitle');

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.className = `${PREFIX}btn`;
        closeButton.style.fontSize = '20px';
        closeButton.style.padding = '0 8px';
        closeButton.style.background = 'transparent';
        closeButton.onclick = () => {
            // Останавливаем запись, если она активна
            if (isRecording) {
                stopRecording();
            }

            // Сохраняем текущий текст перед закрытием
            saveCurrentText();
            // Удаляем фиксированные кнопки, если они есть
            const fixedControls = document.querySelector(`.${PREFIX}recording-fixed-controls`);
            if (fixedControls) {
                fixedControls.remove();
            }
            // Безопасно удаляем элементы
            const modalElement = document.querySelector(`.${PREFIX}speech-modal`);
            const overlayElement = document.querySelector(`.${PREFIX}overlay`);

            if (modalElement && modalElement.parentNode) {
                modalElement.parentNode.removeChild(modalElement);
            }

            if (overlayElement && overlayElement.parentNode) {
                overlayElement.parentNode.removeChild(overlayElement);
            }
        };

        header.appendChild(title);
        header.appendChild(closeButton);

        // Создаем контейнер для контента со скроллом
        const contentContainer = document.createElement('div');
        contentContainer.className = `${PREFIX}settings-modal-content`;

        // Форма настроек
        const form = document.createElement('div');

        // Google API Key
        const googleApiGroup = document.createElement('div');
        googleApiGroup.className = `${PREFIX}form-group`;

        const googleApiLabel = document.createElement('label');
        googleApiLabel.textContent = t('googleKey');
        googleApiLabel.htmlFor = `${PREFIX}google-api-key`;

        const googleApiInput = document.createElement('input');
        googleApiInput.type = 'text';
        googleApiInput.id = `${PREFIX}google-api-key`;
        googleApiInput.value = settings.googleSpeechApiKey;

        googleApiGroup.appendChild(googleApiLabel);
        googleApiGroup.appendChild(googleApiInput);

        // OpenAI API Key
        const openaiApiGroup = document.createElement('div');
        openaiApiGroup.className = `${PREFIX}form-group`;

        const openaiApiLabel = document.createElement('label');
        openaiApiLabel.textContent = t('openaiKey');
        openaiApiLabel.htmlFor = `${PREFIX}openai-api-key`;

        const openaiApiInput = document.createElement('input');
        openaiApiInput.type = 'text';
        openaiApiInput.id = `${PREFIX}openai-api-key`;
        openaiApiInput.value = settings.openaiApiKey;

        openaiApiGroup.appendChild(openaiApiLabel);
        openaiApiGroup.appendChild(openaiApiInput);

        // Принудительное использование API
        const apiForceGroup = document.createElement('div');
        apiForceGroup.className = `${PREFIX}form-group`;

        const apiForceLabel = document.createElement('label');
        apiForceLabel.textContent = t('forceAPI');
        apiForceLabel.htmlFor = `${PREFIX}force-api`;

        const apiForceSelect = document.createElement('select');
        apiForceSelect.id = `${PREFIX}force-api`;

        const apiOptions = [{
                id: 'browser',
                name: t('webAPI')
            },
            {
                id: 'google',
                name: t('cloudAPI')
            }
        ];

        apiOptions.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option.id;
            optionEl.textContent = option.name;
            if (option.id === settings.forceAPI) {
                optionEl.selected = true;
            }
            apiForceSelect.appendChild(optionEl);
        });

        apiForceGroup.appendChild(apiForceLabel);
        apiForceGroup.appendChild(apiForceSelect);

        // Язык
        const languageGroup = document.createElement('div');
        languageGroup.className = `${PREFIX}form-group`;

        const languageLabel = document.createElement('label');
        languageLabel.textContent = t('language');
        languageLabel.htmlFor = `${PREFIX}language`;

        const languageSelect = document.createElement('select');
        languageSelect.id = `${PREFIX}language`;

        // Обновленный список языков: только русский, украинский, чешский и английский
        const languages = [{
                code: 'ru-RU',
                name: 'Русский'
            },
            {
                code: 'uk-UA',
                name: 'Українська'
            },
            {
                code: 'cs-CZ',
                name: 'Čeština'
            },
            {
                code: 'en-US',
                name: 'English (US)'
            },
            {
                code: 'en-GB',
                name: 'English (UK)'
            }
        ];

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            if (lang.code === settings.language) {
                option.selected = true;
            }
            languageSelect.appendChild(option);
        });

        languageGroup.appendChild(languageLabel);
        languageGroup.appendChild(languageSelect);

        // Стиль распознавания
        const recordingStyleGroup = document.createElement('div');
        recordingStyleGroup.className = `${PREFIX}form-group`;

        const recordingStyleLabel = document.createElement('label');
        recordingStyleLabel.textContent = t('recordingStyle');
        recordingStyleLabel.htmlFor = `${PREFIX}recording-style`;

        const recordingStyleSelect = document.createElement('select');
        recordingStyleSelect.id = `${PREFIX}recording-style`;

        const styles = [{
                id: 'byWord',
                name: t('byWord')
            },
            {
                id: 'byPhrase',
                name: t('byPhrase')
            }
        ];

        styles.forEach(style => {
            const option = document.createElement('option');
            option.value = style.id;
            option.textContent = style.name;
            if (style.id === settings.recordingStyle) {
                option.selected = true;
            }
            recordingStyleSelect.appendChild(option);
        });

        recordingStyleGroup.appendChild(recordingStyleLabel);
        recordingStyleGroup.appendChild(recordingStyleSelect);

        // Список сайтов (textarea)
        const sitesGroup = document.createElement('div');
        sitesGroup.className = `${PREFIX}form-group`;

        const sitesLabel = document.createElement('label');
        sitesLabel.textContent = t('sites');
        sitesLabel.htmlFor = `${PREFIX}sites`;

        const sitesInput = document.createElement('textarea');
        sitesInput.id = `${PREFIX}sites`;
        sitesInput.value = settings.siteList;

        sitesGroup.appendChild(sitesLabel);
        sitesGroup.appendChild(sitesInput);

        // TTS голос
        const ttsVoiceGroup = document.createElement('div');
        ttsVoiceGroup.className = `${PREFIX}form-group`;

        const ttsVoiceLabel = document.createElement('label');
        ttsVoiceLabel.textContent = t('voice');
        ttsVoiceLabel.htmlFor = `${PREFIX}tts-voice`;

        const ttsVoiceSelect = document.createElement('select');
        ttsVoiceSelect.id = `${PREFIX}tts-voice`;

        const voices = [{
                id: 'alloy',
                name: 'Alloy'
            },
            {
                id: 'echo',
                name: 'Echo'
            },
            {
                id: 'fable',
                name: 'Fable'
            },
            {
                id: 'onyx',
                name: 'Onyx'
            },
            {
                id: 'nova',
                name: 'Nova'
            },
            {
                id: 'shimmer',
                name: 'Shimmer'
            }
        ];

        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            if (voice.id === settings.ttsVoice) {
                option.selected = true;
            }
            ttsVoiceSelect.appendChild(option);
        });

        ttsVoiceGroup.appendChild(ttsVoiceLabel);
        ttsVoiceGroup.appendChild(ttsVoiceSelect);

        // TTS модель
        const ttsModelGroup = document.createElement('div');
        ttsModelGroup.className = `${PREFIX}form-group`;

        const ttsModelLabel = document.createElement('label');
        ttsModelLabel.textContent = t('model');
        ttsModelLabel.htmlFor = `${PREFIX}tts-model`;

        const ttsModelSelect = document.createElement('select');
        ttsModelSelect.id = `${PREFIX}tts-model`;

        const models = [{
                id: 'tts-1',
                name: 'TTS-1'
            },
            {
                id: 'tts-1-hd',
                name: 'TTS-1-HD'
            }
        ];

        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            if (model.id === settings.ttsModel) {
                option.selected = true;
            }
            ttsModelSelect.appendChild(option);
        });

        ttsModelGroup.appendChild(ttsModelLabel);
        ttsModelGroup.appendChild(ttsModelSelect);

        // Настройки шрифта
        const fontSettings = document.createElement('div');
        fontSettings.className = `${PREFIX}font-settings`;

        const fontSettingsHeader = document.createElement('h3');
        fontSettingsHeader.textContent = t('fontSettings');

        // Первый ряд настроек шрифта
        const fontSettingsRow1 = document.createElement('div');
        fontSettingsRow1.className = `${PREFIX}font-settings-row`;

        // Семейство шрифта
        const fontFamilyGroup = document.createElement('div');
        fontFamilyGroup.className = `${PREFIX}font-settings-item`;

        const fontFamilyLabel = document.createElement('label');
        fontFamilyLabel.textContent = t('font');
        fontFamilyLabel.htmlFor = `${PREFIX}font-family`;

        const fontFamilySelect = document.createElement('select');
        fontFamilySelect.id = `${PREFIX}font-family`;

        const fonts = [{
                id: 'Courier New',
                name: 'Courier New'
            },
            {
                id: 'Arial',
                name: 'Arial'
            },
            {
                id: 'Times New Roman',
                name: 'Times New Roman'
            },
            {
                id: 'Georgia',
                name: 'Georgia'
            },
            {
                id: 'Verdana',
                name: 'Verdana'
            },
            {
                id: 'Calibri',
                name: 'Calibri'
            }
        ];

        fonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font.id;
            option.textContent = font.name;
            option.style.fontFamily = font.id;
            if (font.id === settings.fontFamily) {
                option.selected = true;
            }
            fontFamilySelect.appendChild(option);
        });

        fontFamilyGroup.appendChild(fontFamilyLabel);
        fontFamilyGroup.appendChild(fontFamilySelect);

        // Размер шрифта
        const fontSizeGroup = document.createElement('div');
        fontSizeGroup.className = `${PREFIX}font-settings-item`;

        const fontSizeLabel = document.createElement('label');
        fontSizeLabel.textContent = t('fontSize');
        fontSizeLabel.htmlFor = `${PREFIX}font-size`;

        const fontSizeInput = document.createElement('input');
        fontSizeInput.type = 'number';
        fontSizeInput.id = `${PREFIX}font-size`;
        fontSizeInput.min = '12';
        fontSizeInput.max = '24';
        fontSizeInput.value = settings.fontSize;

        fontSizeGroup.appendChild(fontSizeLabel);
        fontSizeGroup.appendChild(fontSizeInput);

        fontSettingsRow1.appendChild(fontFamilyGroup);
        fontSettingsRow1.appendChild(fontSizeGroup);

        // Второй ряд настроек шрифта
        const fontSettingsRow2 = document.createElement('div');
        fontSettingsRow2.className = `${PREFIX}font-settings-row`;

        // Толщина шрифта
        const fontWeightGroup = document.createElement('div');
        fontWeightGroup.className = `${PREFIX}font-settings-item`;

        const fontWeightLabel = document.createElement('label');
        fontWeightLabel.textContent = t('fontWeight');
        fontWeightLabel.htmlFor = `${PREFIX}font-weight`;

        const fontWeightSelect = document.createElement('select');
        fontWeightSelect.id = `${PREFIX}font-weight`;

        const weights = [{
                id: '400',
                name: t('fontNormal')
            },
            {
                id: '500',
                name: t('fontMedium')
            },
            {
                id: '600',
                name: t('fontSemiBold')
            },
            {
                id: '700',
                name: t('fontBold')
            }
        ];

        weights.forEach(weight => {
            const option = document.createElement('option');
            option.value = weight.id;
            option.textContent = weight.name;
            if (weight.id === settings.fontWeight) {
                option.selected = true;
            }
            fontWeightSelect.appendChild(option);
        });

        fontWeightGroup.appendChild(fontWeightLabel);
        fontWeightGroup.appendChild(fontWeightSelect);

        // Высота строки
        const lineHeightGroup = document.createElement('div');
        lineHeightGroup.className = `${PREFIX}font-settings-item`;

        const lineHeightLabel = document.createElement('label');
        lineHeightLabel.textContent = t('lineHeight');
        lineHeightLabel.htmlFor = `${PREFIX}line-height`;

        const lineHeightInput = document.createElement('input');
        lineHeightInput.type = 'number';
        lineHeightInput.id = `${PREFIX}line-height`;
        lineHeightInput.min = '18';
        lineHeightInput.max = '36';
        lineHeightInput.value = settings.lineHeight;

        lineHeightGroup.appendChild(lineHeightLabel);
        lineHeightGroup.appendChild(lineHeightInput);

        fontSettingsRow2.appendChild(fontWeightGroup);
        fontSettingsRow2.appendChild(lineHeightGroup);

        // Собираем настройки шрифта
        fontSettings.appendChild(fontSettingsHeader);
        fontSettings.appendChild(fontSettingsRow1);
        fontSettings.appendChild(fontSettingsRow2);

        // Настройка тёмной темы
        const darkModeGroup = document.createElement('div');
        darkModeGroup.className = `${PREFIX}form-group`;

        const darkModeLabel = document.createElement('label');
        darkModeLabel.textContent = 'Тёмная тема';
        darkModeLabel.htmlFor = `${PREFIX}dark-mode`;

        const darkModeToggle = document.createElement('input');
        darkModeToggle.type = 'checkbox';
        darkModeToggle.id = `${PREFIX}dark-mode`;
        darkModeToggle.checked = GM_getValue('darkMode', false);
        darkModeToggle.style.width = 'auto';
        darkModeToggle.style.marginLeft = '10px';

        darkModeGroup.appendChild(darkModeLabel);
        darkModeGroup.appendChild(darkModeToggle);

        // Обработчик переключения темы
        darkModeToggle.onchange = () => {
            const isDarkMode = darkModeToggle.checked;
            GM_setValue('darkMode', isDarkMode);

            // Находим модальное окно и переключаем класс
            const modal = document.querySelector(`.${PREFIX}speech-modal`);
            if (modal) {
                if (isDarkMode) {
                    modal.classList.add('dark-mode');
                } else {
                    modal.classList.remove('dark-mode');
                }
            }
        };

        // Добавляем в форму настроек
        form.appendChild(darkModeGroup);

        // И в saveButton.onclick добавьте сохранение настройки:
        GM_setValue('darkMode', darkModeToggle.checked);

        // Кнопка открытия настроек AI
        const openAISettingsButton = document.createElement('button');
        openAISettingsButton.textContent = t('openAISettings');
        openAISettingsButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        openAISettingsButton.style.marginTop = '15px';
        openAISettingsButton.onclick = () => {
            showAISettingsModal(parentModal);
        };
        // Кнопка настроек пользовательских команд
        const customCommandsButton = document.createElement('button');
        customCommandsButton.textContent = t('customCommands');
        customCommandsButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        customCommandsButton.style.marginTop = '15px';
        customCommandsButton.onclick = () => {
            showCustomCommandsModal(parentModal);
        };

        form.appendChild(customCommandsButton);
        // Добавляем контейнер для кнопок экспорта/импорта
        const exportImportGroup = document.createElement('div');
        exportImportGroup.style.marginTop = '20px';
        exportImportGroup.style.display = 'flex';
        exportImportGroup.style.gap = '10px';

        // Кнопка экспорта настроек
        const exportButton = document.createElement('button');
        exportButton.textContent = 'Экспорт настроек';
        exportButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        exportButton.onclick = exportSettings;

        // Кнопка импорта настроек
        const importButton = document.createElement('button');
        importButton.textContent = 'Импорт настроек';
        importButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        importButton.onclick = importSettings;

        // Добавляем кнопки в группу
        exportImportGroup.appendChild(exportButton);
        exportImportGroup.appendChild(importButton);

        // Добавляем группу в форму
        form.appendChild(exportImportGroup);

        // Собираем форму
        form.appendChild(googleApiGroup);
        form.appendChild(openaiApiGroup);
        form.appendChild(apiForceGroup);
        form.appendChild(languageGroup);
        form.appendChild(recordingStyleGroup);
        form.appendChild(sitesGroup);
        form.appendChild(ttsVoiceGroup);
        form.appendChild(ttsModelGroup);
        form.appendChild(fontSettings);
        form.appendChild(openAISettingsButton);

        contentContainer.appendChild(form);

        // Создаем футер для кнопок
        const footerContainer = document.createElement('div');
        footerContainer.className = `${PREFIX}settings-modal-footer`;

        // Кнопки сохранения
        const buttonGroup = document.createElement('div');
        buttonGroup.className = `${PREFIX}button-group`;
        const saveButton = document.createElement('button');
        saveButton.textContent = t('save');
        saveButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        saveButton.type = 'button';
        saveButton.onclick = () => {
            settings.googleSpeechApiKey = googleApiInput.value;
            settings.openaiApiKey = openaiApiInput.value;
            settings.language = languageSelect.value;
            settings.siteList = sitesInput.value;
            settings.ttsVoice = ttsVoiceSelect.value;
            settings.ttsModel = ttsModelSelect.value;
            settings.fontFamily = fontFamilySelect.value;
            settings.fontSize = fontSizeInput.value;
            settings.fontWeight = fontWeightSelect.value;
            settings.lineHeight = lineHeightInput.value;
            settings.recordingStyle = recordingStyleSelect.value;
            settings.forceAPI = apiForceSelect.value;

            // Находим блокнот по ID, если он существует
            const notepadElement = document.getElementById(`${PREFIX}notepad`);
            if (notepadElement) {
                notepadElement.dataset.recordingStyle = settings.recordingStyle;
            }

            // Сохраняем настройки
            GM_setValue('googleSpeechApiKey', settings.googleSpeechApiKey);
            GM_setValue('openaiApiKey', settings.openaiApiKey);
            GM_setValue('language', settings.language);
            GM_setValue('siteList', settings.siteList);
            GM_setValue('ttsVoice', settings.ttsVoice);
            GM_setValue('ttsModel', settings.ttsModel);
            GM_setValue('fontFamily', settings.fontFamily);
            GM_setValue('fontSize', settings.fontSize);
            GM_setValue('fontWeight', settings.fontWeight);
            GM_setValue('lineHeight', settings.lineHeight);
            GM_setValue('recordingStyle', settings.recordingStyle);
            GM_setValue('forceAPI', settings.forceAPI);

            alert(t('settingsSaved'));

            if (!parentModal) {
                const overlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
                if (overlay) document.body.removeChild(overlay);
            }
            document.body.removeChild(modal);

            // Если есть родительское модальное окно, обновляем настройки в нем
            if (parentModal) {
                // Обновляем язык интерфейса
                currentUILang = settings.language;

                // Находим и обновляем элементы блокнота
                const notepad = document.getElementById(`${PREFIX}notepad`);
                if (notepad) {
                    notepad.style.fontFamily = settings.fontFamily;
                    notepad.style.fontSize = `${settings.fontSize}px`;
                    notepad.style.fontWeight = settings.fontWeight;
                    notepad.style.lineHeight = `${settings.lineHeight}px`;
                    notepad.style.backgroundSize = `100% ${settings.lineHeight}px`;

                    applyFontSettings();
                }
            }
        };

        const cancelButton = document.createElement('button');
        cancelButton.textContent = t('cancel');
        cancelButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        cancelButton.type = 'button';
        cancelButton.onclick = () => {
            if (!parentModal) {
                const overlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
                if (overlay) document.body.removeChild(overlay);
            }
            document.body.removeChild(modal);
        };

        buttonGroup.appendChild(saveButton);
        buttonGroup.appendChild(cancelButton);
        footerContainer.appendChild(buttonGroup);

        // Собираем модальное окно
        modal.appendChild(header);
        modal.appendChild(contentContainer);
        modal.appendChild(footerContainer);

        document.body.appendChild(modal);

        // Если есть родительское модальное окно, центрируем относительно него
        if (parentModal) {
            const parentRect = parentModal.getBoundingClientRect();
            modal.style.top = `${parentRect.top + 100}px`;
        }
    }

    // Модальное окно настроек AI
    // Модальное окно настроек AI
    function showAISettingsModal(parentModal) {
        // Удаляем предыдущее модальное окно настроек, если оно есть
        const existingModal = document.querySelector(`.${PREFIX}ai-settings-modal`);
        const existingOverlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
        if (existingModal) document.body.removeChild(existingModal);
        if (existingOverlay) document.body.removeChild(existingOverlay);

        // Создаем оверлей
        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;
        document.body.appendChild(overlay);

        // Создаем модальное окно настроек
        const modal = document.createElement('div');
        modal.className = `${PREFIX}settings-modal ${PREFIX}ai-settings-modal`;

        // Заголовок
        const header = document.createElement('div');
        header.className = `${PREFIX}modal-header`;

        const title = document.createElement('h2');
        title.textContent = t('aiSettingsTitle');

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.className = `${PREFIX}btn`;
        closeButton.style.fontSize = '20px';
        closeButton.style.padding = '0 8px';
        closeButton.style.background = 'transparent';
        closeButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        header.appendChild(title);
        header.appendChild(closeButton);

        // Создаем контейнер для контента со скроллом
        const contentContainer = document.createElement('div');
        contentContainer.className = `${PREFIX}settings-modal-content`;

        // Форма настроек AI
        const form = document.createElement('div');

        // Выбор AI провайдера по умолчанию
        const aiProviderGroup = document.createElement('div');
        aiProviderGroup.className = `${PREFIX}form-group`;

        const aiProviderLabel = document.createElement('label');
        aiProviderLabel.textContent = t('defaultAIProvider');
        aiProviderLabel.htmlFor = `${PREFIX}default-ai-provider`;

        const aiProviderContainer = document.createElement('div');
        aiProviderContainer.style.display = 'flex';
        aiProviderContainer.style.gap = '15px';
        aiProviderContainer.style.marginTop = '5px';

        // Radio для Gemini
        const geminiRadioContainer = document.createElement('div');
        geminiRadioContainer.style.display = 'flex';
        geminiRadioContainer.style.alignItems = 'center';

        const geminiRadio = document.createElement('input');
        geminiRadio.type = 'radio';
        geminiRadio.id = `${PREFIX}ai-provider-gemini`;
        geminiRadio.name = `${PREFIX}ai-provider`;
        geminiRadio.value = 'gemini';
        geminiRadio.checked = settings.defaultAIProvider === 'gemini';

        const geminiLabel = document.createElement('label');
        geminiLabel.textContent = 'Google Gemini';
        geminiLabel.htmlFor = `${PREFIX}ai-provider-gemini`;
        geminiLabel.style.marginLeft = '5px';

        geminiRadioContainer.appendChild(geminiRadio);
        geminiRadioContainer.appendChild(geminiLabel);

        // Radio для GPT
        const gptRadioContainer = document.createElement('div');
        gptRadioContainer.style.display = 'flex';
        gptRadioContainer.style.alignItems = 'center';

        const gptRadio = document.createElement('input');
        gptRadio.type = 'radio';
        gptRadio.id = `${PREFIX}ai-provider-gpt`;
        gptRadio.name = `${PREFIX}ai-provider`;
        gptRadio.value = 'gpt';
        gptRadio.checked = settings.defaultAIProvider === 'gpt';

        const gptLabel = document.createElement('label');
        gptLabel.textContent = 'OpenAI GPT';
        gptLabel.htmlFor = `${PREFIX}ai-provider-gpt`;
        gptLabel.style.marginLeft = '5px';

        gptRadioContainer.appendChild(gptRadio);
        gptRadioContainer.appendChild(gptLabel);

        aiProviderContainer.appendChild(geminiRadioContainer);
        aiProviderContainer.appendChild(gptRadioContainer);

        aiProviderGroup.appendChild(aiProviderLabel);
        aiProviderGroup.appendChild(aiProviderContainer);

        // Ключ API Gemini
        const geminiKeyGroup = document.createElement('div');
        geminiKeyGroup.className = `${PREFIX}form-group`;

        const geminiKeyLabel = document.createElement('label');
        geminiKeyLabel.textContent = t('geminiKey');
        geminiKeyLabel.htmlFor = `${PREFIX}gemini-key`;

        const geminiKeyInput = document.createElement('input');
        geminiKeyInput.type = 'text';
        geminiKeyInput.id = `${PREFIX}gemini-key`;
        geminiKeyInput.value = settings.geminiApiKey;

        geminiKeyGroup.appendChild(geminiKeyLabel);
        geminiKeyGroup.appendChild(geminiKeyInput);

        // URL API Gemini
        const geminiUrlGroup = document.createElement('div');
        geminiUrlGroup.className = `${PREFIX}form-group`;

        const geminiUrlLabel = document.createElement('label');
        geminiUrlLabel.textContent = t('geminiUrl');
        geminiUrlLabel.htmlFor = `${PREFIX}gemini-url`;

        const geminiUrlInput = document.createElement('input');
        geminiUrlInput.type = 'text';
        geminiUrlInput.id = `${PREFIX}gemini-url`;
        geminiUrlInput.value = settings.geminiApiUrl;

        geminiUrlGroup.appendChild(geminiUrlLabel);
        geminiUrlGroup.appendChild(geminiUrlInput);

        // Модель Gemini
        const geminiModelGroup = document.createElement('div');
        geminiModelGroup.className = `${PREFIX}form-group`;

        const geminiModelLabel = document.createElement('label');
        geminiModelLabel.textContent = t('geminiModel');
        geminiModelLabel.htmlFor = `${PREFIX}gemini-model`;

        const geminiModelInput = document.createElement('input');
        geminiModelInput.type = 'text';
        geminiModelInput.id = `${PREFIX}gemini-model`;
        geminiModelInput.value = settings.geminiModel || 'gemini-pro';
        geminiModelInput.placeholder = 'gemini-pro';

        geminiModelGroup.appendChild(geminiModelLabel);
        geminiModelGroup.appendChild(geminiModelInput);

        // Ключ API GPT
        const gptKeyGroup = document.createElement('div');
        gptKeyGroup.className = `${PREFIX}form-group`;

        const gptKeyLabel = document.createElement('label');
        gptKeyLabel.textContent = t('gptKey');
        gptKeyLabel.htmlFor = `${PREFIX}gpt-key`;

        const gptKeyInput = document.createElement('input');
        gptKeyInput.type = 'text';
        gptKeyInput.id = `${PREFIX}gpt-key`;
        gptKeyInput.value = settings.gptApiKey;

        gptKeyGroup.appendChild(gptKeyLabel);
        gptKeyGroup.appendChild(gptKeyInput);

        // URL API GPT
        const gptUrlGroup = document.createElement('div');
        gptUrlGroup.className = `${PREFIX}form-group`;

        const gptUrlLabel = document.createElement('label');
        gptUrlLabel.textContent = t('gptUrl');
        gptUrlLabel.htmlFor = `${PREFIX}gpt-url`;

        const gptUrlInput = document.createElement('input');
        gptUrlInput.type = 'text';
        gptUrlInput.id = `${PREFIX}gpt-url`;
        gptUrlInput.value = settings.gptApiUrl;

        gptUrlGroup.appendChild(gptUrlLabel);
        gptUrlGroup.appendChild(gptUrlInput);

        // Модель GPT
        const gptModelGroup = document.createElement('div');
        gptModelGroup.className = `${PREFIX}form-group`;

        const gptModelLabel = document.createElement('label');
        gptModelLabel.textContent = t('gptModel');
        gptModelLabel.htmlFor = `${PREFIX}gpt-model`;

        const gptModelInput = document.createElement('input');
        gptModelInput.type = 'text';
        gptModelInput.id = `${PREFIX}gpt-model`;
        gptModelInput.value = settings.gptModel || 'gpt-3.5-turbo';
        gptModelInput.placeholder = 'gpt-3.5-turbo, gpt-4, gpt-4-turbo...';

        gptModelGroup.appendChild(gptModelLabel);
        gptModelGroup.appendChild(gptModelInput);

        // Настройка температуры
        const temperatureGroup = document.createElement('div');
        temperatureGroup.className = `${PREFIX}form-group`;

        const temperatureLabel = document.createElement('label');
        temperatureLabel.textContent = t('temperature');
        temperatureLabel.htmlFor = `${PREFIX}temperature`;

        const temperatureInput = document.createElement('input');
        temperatureInput.type = 'number';
        temperatureInput.id = `${PREFIX}temperature`;
        temperatureInput.min = '0';
        temperatureInput.max = '2';
        temperatureInput.step = '0.1';
        temperatureInput.value = settings.temperature || 0.7;
        temperatureInput.style.width = '100px';

        temperatureGroup.appendChild(temperatureLabel);
        temperatureGroup.appendChild(temperatureInput);

        // Настройка max_tokens
        const maxTokensGroup = document.createElement('div');
        maxTokensGroup.className = `${PREFIX}form-group`;

        const maxTokensLabel = document.createElement('label');
        maxTokensLabel.textContent = t('maxTokens');
        maxTokensLabel.htmlFor = `${PREFIX}max-tokens`;

        const maxTokensInput = document.createElement('input');
        maxTokensInput.type = 'number';
        maxTokensInput.id = `${PREFIX}max-tokens`;
        maxTokensInput.min = '100';
        maxTokensInput.max = '100000';
        maxTokensInput.step = '1';
        maxTokensInput.value = settings.maxTokens || 4096;
        maxTokensInput.style.width = '120px';

        maxTokensGroup.appendChild(maxTokensLabel);
        maxTokensGroup.appendChild(maxTokensInput);

        // Системный промпт
        const systemPromptGroup = document.createElement('div');
        systemPromptGroup.className = `${PREFIX}form-group`;

        const systemPromptLabel = document.createElement('label');
        systemPromptLabel.textContent = t('systemPrompt');
        systemPromptLabel.htmlFor = `${PREFIX}system-prompt`;

        const systemPromptInput = document.createElement('textarea');
        systemPromptInput.id = `${PREFIX}system-prompt`;
        systemPromptInput.value = settings.systemPrompt;
        systemPromptInput.rows = 4;

        systemPromptGroup.appendChild(systemPromptLabel);
        systemPromptGroup.appendChild(systemPromptInput);

        // Основной промпт
        const mainPromptGroup = document.createElement('div');
        mainPromptGroup.className = `${PREFIX}form-group`;

        const mainPromptLabel = document.createElement('label');
        mainPromptLabel.textContent = t('mainPrompt');
        mainPromptLabel.htmlFor = `${PREFIX}main-prompt`;

        const mainPromptInput = document.createElement('textarea');
        mainPromptInput.id = `${PREFIX}main-prompt`;
        mainPromptInput.value = settings.mainPrompt;
        mainPromptInput.rows = 4;

        mainPromptGroup.appendChild(mainPromptLabel);
        mainPromptGroup.appendChild(mainPromptInput);

        // Количество сообщений из истории
        const historyCountGroup = document.createElement('div');
        historyCountGroup.className = `${PREFIX}form-group`;

        const historyCountLabel = document.createElement('label');
        historyCountLabel.textContent = t('historyCount');
        historyCountLabel.htmlFor = `${PREFIX}history-count`;

        const historyCountInput = document.createElement('input');
        historyCountInput.type = 'number';
        historyCountInput.id = `${PREFIX}history-count`;
        historyCountInput.min = '0';
        historyCountInput.max = '10';
        historyCountInput.value = settings.historyCount;
        historyCountInput.style.width = '80px';

        historyCountGroup.appendChild(historyCountLabel);
        historyCountGroup.appendChild(historyCountInput);

        // Собираем форму
        form.appendChild(aiProviderGroup);

        // Раздел настроек Gemini
        const geminiSection = document.createElement('div');
        geminiSection.className = `${PREFIX}settings-section`;

        const geminiHeader = document.createElement('h3');
        geminiHeader.textContent = t('geminiSettings');
        geminiHeader.style.marginTop = '20px';
        geminiHeader.style.marginBottom = '10px';

        geminiSection.appendChild(geminiHeader);
        geminiSection.appendChild(geminiKeyGroup);
        geminiSection.appendChild(geminiUrlGroup);
        geminiSection.appendChild(geminiModelGroup);

        // Раздел настроек GPT
        const gptSection = document.createElement('div');
        gptSection.className = `${PREFIX}settings-section`;

        const gptHeader = document.createElement('h3');
        gptHeader.textContent = t('gptSettings');
        gptHeader.style.marginTop = '20px';
        gptHeader.style.marginBottom = '10px';

        gptSection.appendChild(gptHeader);
        gptSection.appendChild(gptKeyGroup);
        gptSection.appendChild(gptUrlGroup);
        gptSection.appendChild(gptModelGroup);

        // Общие настройки для запросов
        const commonSection = document.createElement('div');
        commonSection.className = `${PREFIX}settings-section`;

        const commonHeader = document.createElement('h3');
        commonHeader.textContent = t('commonSettings');
        commonHeader.style.marginTop = '20px';
        commonHeader.style.marginBottom = '10px';

        commonSection.appendChild(commonHeader);

        // Группа параметров запроса
        const requestParamsContainer = document.createElement('div');
        requestParamsContainer.style.display = 'flex';
        requestParamsContainer.style.gap = '20px';
        requestParamsContainer.style.flexWrap = 'wrap';

        requestParamsContainer.appendChild(temperatureGroup);
        requestParamsContainer.appendChild(maxTokensGroup);
        requestParamsContainer.appendChild(historyCountGroup);

        commonSection.appendChild(requestParamsContainer);
        commonSection.appendChild(systemPromptGroup);
        commonSection.appendChild(mainPromptGroup);

        // Добавляем все разделы
        form.appendChild(geminiSection);
        form.appendChild(gptSection);
        form.appendChild(commonSection);

        contentContainer.appendChild(form);

        // Создаем футер для кнопок
        const footerContainer = document.createElement('div');
        footerContainer.className = `${PREFIX}settings-modal-footer`;

        // Кнопки для сохранения настроек AI
        const buttonGroup = document.createElement('div');
        buttonGroup.className = `${PREFIX}button-group`;

        const saveButton = document.createElement('button');
        saveButton.textContent = t('save');
        saveButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        saveButton.type = 'button';
        saveButton.onclick = () => {
            settings.googleSpeechApiKey = googleApiInput.value;
            settings.openaiApiKey = openaiApiInput.value;
            settings.language = languageSelect.value;
            settings.siteList = sitesInput.value;
            settings.ttsVoice = ttsVoiceSelect.value;
            settings.ttsModel = ttsModelSelect.value;
            settings.fontFamily = fontFamilySelect.value;
            settings.fontSize = fontSizeInput.value;
            settings.fontWeight = fontWeightSelect.value;
            settings.lineHeight = lineHeightInput.value;
            settings.recordingStyle = recordingStyleSelect.value;
            settings.forceAPI = apiForceSelect.value;

            // Находим блокнот по ID, если он существует
            const notepadElement = document.getElementById(`${PREFIX}notepad`);
            if (notepadElement) {
                notepadElement.dataset.recordingStyle = settings.recordingStyle;
            }

            // Сохраняем настройки
            GM_setValue('googleSpeechApiKey', settings.googleSpeechApiKey);
            GM_setValue('openaiApiKey', settings.openaiApiKey);
            GM_setValue('language', settings.language);
            GM_setValue('siteList', settings.siteList);
            GM_setValue('ttsVoice', settings.ttsVoice);
            GM_setValue('ttsModel', settings.ttsModel);
            GM_setValue('fontFamily', settings.fontFamily);
            GM_setValue('fontSize', settings.fontSize);
            GM_setValue('fontWeight', settings.fontWeight);
            GM_setValue('lineHeight', settings.lineHeight);
            GM_setValue('recordingStyle', settings.recordingStyle);
            GM_setValue('forceAPI', settings.forceAPI);

            alert(t('settingsSaved'));

            // ПРИМЕНЯЕМ НАСТРОЙКИ ШРИФТА ЗДЕСЬ:
            applyFontSettings(); // Вызываем функцию!

            if (!parentModal) {
                const overlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
                if (overlay) document.body.removeChild(overlay);
            }
            document.body.removeChild(modal);

            // Если есть родительское модальное окно, обновляем настройки в нем
            //Удаляем эти строки:
            if (parentModal) {
                // Обновляем язык интерфейса
                currentUILang = settings.language;

                // Находим и обновляем элементы блокнота
                const notepad = document.getElementById(`${PREFIX}notepad`);
                if (notepad) {
                    notepad.style.fontFamily = settings.fontFamily;
                    notepad.style.fontSize = `${settings.fontSize}px`;
                    notepad.style.fontWeight = settings.fontWeight;
                    notepad.style.lineHeight = `${settings.lineHeight}px`;
                    notepad.style.backgroundSize = `100% ${settings.lineHeight}px`;
                }
            }
        };

        const cancelButton = document.createElement('button');
        cancelButton.textContent = t('cancel');
        cancelButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        cancelButton.type = 'button';
        cancelButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        buttonGroup.appendChild(saveButton);
        buttonGroup.appendChild(cancelButton);
        footerContainer.appendChild(buttonGroup);

        // Собираем модальное окно
        modal.appendChild(header);
        modal.appendChild(contentContainer);
        modal.appendChild(footerContainer);

        document.body.appendChild(modal);

        // Центрируем модальное окно
        modal.style.zIndex = '2147483648';
    }

    // В функции sendAudioToGoogleSpeech нужно изменить обработку результата:
    function sendAudioToGoogleSpeech(audioBlob, notepad) {
        if (!settings.googleSpeechApiKey) {
            console.error('Google Speech API ключ не указан');
            return;
        }

        // Base64 кодирование аудио
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];

            // Максимально простой запрос для снижения ошибок
            const requestData = {
                config: {
                    encoding: "LINEAR16",
                    sampleRateHertz: 44100,
                    languageCode: settings.language,
                    enableAutomaticPunctuation: true
                },
                audio: {
                    content: base64Audio
                }
            };

            // Отправка запроса через GM_xmlhttpRequest
            GM_xmlhttpRequest({
                method: 'POST',
                url: `https://speech.googleapis.com/v1/speech:recognize?key=${settings.googleSpeechApiKey}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(requestData),
                onload: function (response) {
                    try {
                        if (response.status >= 200 && response.status < 300) {
                            const data = JSON.parse(response.responseText);
                            if (data.results && data.results.length > 0) {
                                // Объединяем все результаты для получения полного текста
                                let transcript = '';
                                for (const result of data.results) {
                                    if (result.alternatives && result.alternatives.length > 0) {
                                        transcript += result.alternatives[0].transcript + ' ';
                                    }
                                }
                                transcript = transcript.trim();

                                if (transcript) {
                                    // Проверяем на наличие команды в тексте
                                    const commandInfo = detectCommand(transcript);
                                    if (commandInfo.found) {
                                        // Команда найдена - используем очищенный текст
                                        transcript = cleanTextFromCommands(transcript);

                                        // Если после очистки текст пустой, не добавляем ничего
                                        if (!transcript.trim()) return;
                                    }

                                    // Обновляем блокнот с очищенным транскриптом
                                    updateTranscript(notepad, transcript);
                                } else {
                                    console.warn('Получен пустой транскрипт от Google API');
                                }
                            } else {
                                console.warn('Не удалось распознать речь в данном фрагменте');
                            }
                        } else {
                            console.error('Ошибка API Google Speech:', response.status, response.responseText);
                        }
                    } catch (error) {
                        console.error('Ошибка обработки ответа API:', error);
                        console.error('Сырой ответ:', response.responseText);
                    }
                },
                onerror: function (error) {
                    console.error('Ошибка запроса Google Speech API:', error);
                }
            });
        };
    }

    // Функция для создания аудио Blob из буфера и отправки на сервер
    function processAudioForServer(audioChunks, notepad) {
        // Проверяем, есть ли аудио для обработки
        if (!audioChunks || audioChunks.length === 0) {
            console.warn("Нет аудио чанков для обработки");
            return;
        }

        try {
            // Объединяем все чанки в один буфер
            const combinedBuffer = new Float32Array(audioChunks.reduce((acc, chunk) => acc + chunk.length, 0));
            let offset = 0;
            for (const chunk of audioChunks) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            // Улучшаем качество аудио перед отправкой
            const normalizedBuffer = normalizeAudio(combinedBuffer);

            // Конвертируем в WAV формат
            const wavBuffer = float32ToWav(normalizedBuffer, 44100);
            const audioBlob = new Blob([wavBuffer], {
                type: 'audio/wav'
            });

            // Отправляем на сервер Google
            sendAudioToGoogleSpeech(audioBlob, notepad);
        } catch (error) {
            console.error("Ошибка при обработке аудио для сервера:", error);
        }
    }

    // Функция для нормализации аудио (повышает качество распознавания)
    function normalizeAudio(buffer) {
        // Находим максимальную амплитуду
        let maxAmp = 0;
        for (let i = 0; i < buffer.length; i++) {
            const abs = Math.abs(buffer[i]);
            if (abs > maxAmp) {
                maxAmp = abs;
            }
        }

        // Если максимальная амплитуда слишком мала, увеличиваем громкость
        if (maxAmp < 0.1) {
            const gain = 0.8 / Math.max(0.001, maxAmp); // Предотвращение деления на 0
            const newBuffer = new Float32Array(buffer.length);
            for (let i = 0; i < buffer.length; i++) {
                newBuffer[i] = buffer[i] * gain;
            }
            return newBuffer;
        } else if (maxAmp > 0.9) {
            // Если амплитуда слишком высокая, немного снижаем для предотвращения искажений
            const gain = 0.8 / maxAmp;
            const newBuffer = new Float32Array(buffer.length);
            for (let i = 0; i < buffer.length; i++) {
                newBuffer[i] = buffer[i] * gain;
            }
            return newBuffer;
        }

        // Удаление шума - отсечение очень тихих звуков
        const noiseFloor = 0.01; // Порог шума
        const newBuffer = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            newBuffer[i] = Math.abs(buffer[i]) < noiseFloor ? 0 : buffer[i];
        }

        return newBuffer;
    }

    // Функция для генерации речи через OpenAI API
    function speakText(text) {
        if (!settings.openaiApiKey) {
            alert(format(t('noKeySpecified'), 'OpenAI'));
            return;
        }

        // Оцениваем количество токенов для статистики
        const estimatedTokens = estimateTokens(text);

        // Создаем элемент управления TTS
        const ttsControls = document.createElement('div');
        ttsControls.className = `${PREFIX}tts-controls`;

        const pauseButton = document.createElement('button');
        pauseButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        pauseButton.textContent = t('pause');

        const stopButton = document.createElement('button');
        stopButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        stopButton.textContent = t('stop');

        const settingsButton = document.createElement('button');
        settingsButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        settingsButton.textContent = t('settings');
        settingsButton.onclick = () => {
            showSettingsModal();
        };

        ttsControls.appendChild(pauseButton);
        ttsControls.appendChild(stopButton);
        ttsControls.appendChild(settingsButton);

        document.body.appendChild(ttsControls);

        // Запрос к OpenAI TTS API
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.openai.com/v1/audio/speech',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.openaiApiKey}`
            },
            data: JSON.stringify({
                model: settings.ttsModel,
                input: text,
                voice: settings.ttsVoice
            }),
            responseType: 'blob',
            onload: response => {
                // // console.log('TTS API ответ получен', response.status);
                if (response.status >= 200 && response.status < 300) {
                    const audioBlob = response.response;
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = new Audio(audioUrl);

                    // Обновляем статистику (примерно 1.5 токена на выходной токен для TTS)
                    updateOpenAIStats(estimatedTokens, Math.ceil(estimatedTokens * 1.5));

                    // Настраиваем контроллеры
                    let isPaused = false;

                    pauseButton.onclick = () => {
                        if (isPaused) {
                            audio.play();
                            pauseButton.textContent = t('pause');
                        } else {
                            audio.pause();
                            pauseButton.textContent = t('continue');
                        }
                        isPaused = !isPaused;
                    };

                    stopButton.onclick = () => {
                        audio.pause();
                        audio.currentTime = 0;
                        if (document.body.contains(ttsControls)) {
                            document.body.removeChild(ttsControls);
                        }
                    };

                    audio.onended = () => {
                        if (document.body.contains(ttsControls)) {
                            document.body.removeChild(ttsControls);
                        }
                    };

                    audio.play().catch(err => {
                        console.error('Ошибка воспроизведения аудио:', err);
                        alert(t('errorPlayAudio'));
                        if (document.body.contains(ttsControls)) {
                            document.body.removeChild(ttsControls);
                        }
                    });
                } else {
                    console.error('Ошибка OpenAI TTS API:', response.status, response.statusText);
                    alert(`Ошибка при генерации речи: ${response.status} ${response.statusText}`);
                    if (document.body.contains(ttsControls)) {
                        document.body.removeChild(ttsControls);
                    }
                }
            },
            onerror: error => {
                console.error('Ошибка OpenAI TTS API:', error);
                alert(t('errorTTS'));
                if (document.body.contains(ttsControls)) {
                    document.body.removeChild(ttsControls);
                }
            }
        });
    }

    // Обработка выделения текста
    function handleTextSelection() {
        const selection = window.getSelection();

        // Удаляем существующую кнопку "Прочесть", если она уже есть
        const existingButton = document.querySelector(`.${PREFIX}read-button`);
        if (existingButton) {
            existingButton.remove();
        }

        // Проверяем, есть ли выделенный текст
        if (!selection || !selection.toString().trim()) return;

        // Проверяем, находимся ли мы на подходящем сайте
        const currentHost = window.location.hostname;
        const allowedSites = settings.siteList.split(',').map(site => site.trim());

        if (!allowedSites.some(site => currentHost.includes(site))) return;

        // Создаем кнопку "Прочесть"
        const readButton = document.createElement('button');
        readButton.className = `${PREFIX}read-button`;
        readButton.textContent = t('read');

        // Позиционируем кнопку рядом с выделенным текстом
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        readButton.style.top = `${window.scrollY + rect.bottom + 5}px`;
        readButton.style.left = `${window.scrollX + rect.left}px`;

        // Сохраняем текст для TTS
        const selectedText = selection.toString().trim();

        // Добавляем обработчик для кнопки
        readButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // // console.log('Запуск TTS для текста:', selectedText);
            speakText(selectedText);
            readButton.remove();
        };

        document.body.appendChild(readButton);
    }

    // Назначаем горячую клавишу для открытия модального окна (Ctrl+Shift+S)
    document.addEventListener('keydown', event => {
        if (event.ctrlKey && event.shiftKey && event.key === 'S') {
            event.preventDefault();
            createSpeechModal();
        }
    });

    // Добавим горячую клавишу для AI таба
    document.addEventListener('keydown', event => {
        if (event.ctrlKey && event.key === 'a' && document.querySelector(`.${PREFIX}speech-modal`)) {
            event.preventDefault();
            // Находим таб AI через селектор
            document.querySelector(`[data-target="${PREFIX}ai-content"]`).click();
        }
    });

    // Слушаем выделение текста, но с ограничением частоты вызовов
    let selectionTimeout = null;
    document.addEventListener('mouseup', () => {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(handleTextSelection, 200);
    });

    // 1. Новая функция обработки команд - полная замена
    function processVoiceCommand(text) {
        if (!text) return {
            processed: false,
            text: text
        };

        const lang = settings.language;
        const activationPhrases = {
            'ru-RU': ['помощник', 'компьютер', 'ассистент', 'команда'],
            'en-US': ['assistant', 'computer', 'command'],
            'uk-UA': ['помічник', 'комп\'ютер', 'асистент', 'команда'],
            'cs-CZ': ['asistent', 'počítač', 'příkaz']
        };

        // Получаем список фраз для текущего языка
        const phrases = activationPhrases[lang] || activationPhrases['ru-RU'];

        // Получаем команды для текущего языка
        const commands = VOICE_COMMANDS[lang] || VOICE_COMMANDS['ru-RU'];
        const customCommands = GM_getValue('customVoiceCommands', {});
        const langCommands = customCommands[lang] ? {
            ...commands,
            ...customCommands[lang]
        } : commands;

        // Преобразуем текст в нижний регистр для поиска
        const lowerText = text.toLowerCase();

        // Ищем активационную фразу
        let activationPhrase = null;
        let activationIndex = -1;

        for (const phrase of phrases) {
            const index = lowerText.indexOf(phrase);
            if (index !== -1) {
                activationPhrase = phrase;
                activationIndex = index;
                break;
            }
        }

        // Если активационная фраза не найдена, возвращаем исходный текст
        if (!activationPhrase) {
            return {
                processed: false,
                text: text
            };
        }

        // Текст до активационной фразы (сохраняем в оригинальном регистре)
        const beforeActivation = text.substring(0, activationIndex).trim();

        // Текст после активационной фразы
        const afterActivationStart = activationIndex + activationPhrase.length;
        const afterActivation = lowerText.substring(afterActivationStart).trim();
        const originalAfterActivation = text.substring(afterActivationStart).trim();

        // Если после активационной фразы ничего нет
        if (!afterActivation) {
            console.log("Только активационная фраза без команды");
            return {
                processed: true,
                text: beforeActivation
            };
        }

        // Ищем команду среди доступных команд
        let foundCommand = null;
        let commandAction = null;
        let commandIndex = -1;
        let commandEnd = -1;

        // Сортируем команды по длине (от длинных к коротким)
        // чтобы сначала проверять более длинные команды
        const sortedCommands = Object.entries(langCommands)
            .sort((a, b) => b[0].length - a[0].length);

        for (const [cmd, action] of sortedCommands) {
            // Проверяем различные варианты размещения команды
            if (afterActivation === cmd) {
                // Точное совпадение
                foundCommand = cmd;
                commandAction = action;
                commandIndex = 0;
                commandEnd = cmd.length;
                break;
            } else if (afterActivation.startsWith(cmd + " ")) {
                // Команда в начале с пробелом после
                foundCommand = cmd;
                commandAction = action;
                commandIndex = 0;
                commandEnd = cmd.length;
                break;
            } else if (afterActivation.includes(" " + cmd + " ")) {
                // Команда в середине с пробелами до и после
                foundCommand = cmd;
                commandAction = action;
                commandIndex = afterActivation.indexOf(" " + cmd + " ") + 1;
                commandEnd = commandIndex + cmd.length;
                break;
            } else if (afterActivation.endsWith(" " + cmd)) {
                // Команда в конце с пробелом до
                foundCommand = cmd;
                commandAction = action;
                commandIndex = afterActivation.lastIndexOf(" " + cmd) + 1;
                commandEnd = commandIndex + cmd.length;
                break;
            }
        }

        // Если команда найдена
        if (foundCommand) {
            console.log(`Найдена команда: ${foundCommand}, действие: ${commandAction}`);

            // Выполняем действие команды
            executeVoiceCommand(commandAction);

            // Показываем индикатор выполнения команды
            showCommandIndicator(foundCommand);

            // Для команд пунктуации вставляем соответствующий знак
            if (['period', 'comma', 'questionMark', 'exclamationMark', 'colon'].includes(commandAction)) {
                const punctuation = {
                    'period': '.',
                    'comma': ',',
                    'questionMark': '?',
                    'exclamationMark': '!',
                    'colon': ':'
                } [commandAction];

                // Текст после команды (в оригинальном регистре)
                const afterCommand = originalAfterActivation.substring(commandEnd).trim();

                // Формируем результат: текст до активации + знак пунктуации + текст после команды
                let result = '';
                if (beforeActivation) {
                    result += beforeActivation + ' ';
                }
                result += punctuation;
                if (afterCommand) {
                    result += ' ' + afterCommand;
                }

                return {
                    processed: true,
                    text: result.trim()
                };
            }

            // Для других команд просто удаляем активационную фразу и команду
            // Текст после команды (в оригинальном регистре)
            const afterCommand = originalAfterActivation.substring(commandEnd).trim();

            // Формируем результат: текст до активации + текст после команды
            let result = '';
            if (beforeActivation) {
                result += beforeActivation;
            }
            if (afterCommand) {
                if (result) result += ' ';
                result += afterCommand;
            }

            return {
                processed: true,
                text: result.trim()
            };
        }

        // Если активационная фраза найдена, но команда не распознана
        // Помещаем весь текст после активационной фразы в фигурные скобки
        console.log("Специальная инструкция: " + originalAfterActivation);

        let result = '';
        if (beforeActivation) {
            result += beforeActivation + ' ';
        }
        result += `{${originalAfterActivation}}`;

        return {
            processed: true,
            text: result.trim()
        };
    }


    // Добавляем кнопку на страницу
    function addAssistantButton() {
        // Проверяем, добавлена ли уже кнопка
        if (buttonAdded || document.getElementById(`${PREFIX}speech-assistant-button`)) {
            return;
        }

        debug('Добавляем кнопку помощника');

        const assistantButton = document.createElement('button');
        assistantButton.id = `${PREFIX}speech-assistant-button`;
        assistantButton.textContent = '🎤';
        assistantButton.title = 'Голосовой помощник (Ctrl+Shift+S)';

        // Обработчик клика
        assistantButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            createSpeechModal();
        };

        document.body.appendChild(assistantButton);
        buttonAdded = true;

        debug('Кнопка успешно добавлена');
    }
    // Функция для обработки текста через AI
    function processTextWithAI() {
        // Получаем текст из блокнота
        const notepadText = getNotepadText(document.getElementById(`${PREFIX}notepad`));
        if (!notepadText.trim()) {
            alert(t('noTextToProcess'));
            return;
        }

        // Если указан провайдер по умолчанию, используем его напрямую
        if (settings.defaultAIProvider === 'gemini') {
            processWithGemini(notepadText);
            return;
        } else if (settings.defaultAIProvider === 'gpt') {
            processWithGPT(notepadText);
            return;
        }

        // Создаем диалоговое окно для выбора провайдера AI
        const dialog = document.createElement('div');
        dialog.className = `${PREFIX}overlay`;
        dialog.style.zIndex = '2147483648';

        const dialogContent = document.createElement('div');
        dialogContent.className = `${PREFIX}settings-modal`;
        dialogContent.style.width = '400px';

        const dialogHeader = document.createElement('div');
        dialogHeader.className = `${PREFIX}modal-header`;

        const dialogTitle = document.createElement('h2');
        dialogTitle.textContent = t('selectAIProvider');

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.className = `${PREFIX}btn`;
        closeButton.style.fontSize = '20px';
        closeButton.style.padding = '0 8px';
        closeButton.style.background = 'transparent';
        closeButton.onclick = () => {
            document.body.removeChild(dialog);
        };

        dialogHeader.appendChild(dialogTitle);
        dialogHeader.appendChild(closeButton);

        const dialogButtons = document.createElement('div');
        dialogButtons.className = `${PREFIX}button-group`;
        dialogButtons.style.justifyContent = 'center';
        dialogButtons.style.marginTop = '20px';

        const geminiButton = document.createElement('button');
        geminiButton.textContent = t('useGemini');
        geminiButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        geminiButton.onclick = () => {
            document.body.removeChild(dialog);
            processWithGemini(notepadText);
        };

        const gptButton = document.createElement('button');
        gptButton.textContent = t('useGPT');
        gptButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        gptButton.onclick = () => {
            document.body.removeChild(dialog);
            processWithGPT(notepadText);
        };

        const cancelButton = document.createElement('button');
        cancelButton.textContent = t('cancel');
        cancelButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        cancelButton.onclick = () => {
            document.body.removeChild(dialog);
        };

        dialogButtons.appendChild(geminiButton);
        dialogButtons.appendChild(gptButton);
        dialogButtons.appendChild(cancelButton);

        dialogContent.appendChild(dialogHeader);
        dialogContent.appendChild(dialogButtons);

        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
    }

    // Обработка через Google Gemini
    function processWithGemini(text) {
        if (!settings.geminiApiKey) {
            alert(format(t('noApiKey'), 'Google Gemini'));
            return;
        }

        // Получаем историю сообщений
        const messages = getHistoryMessages(text);
        const messagesText = messages.join('\n\n');

        // Заменяем плейсхолдер в промпте
        const prompt = settings.mainPrompt.replace('{{text}}', messagesText);

        // Показываем индикатор загрузки
        showLoading();

        // Формируем запрос в формате, аналогичном PHP-адаптеру
        const requestData = {
            contents: [{
                    role: "user",
                    parts: [{
                        text: settings.systemPrompt
                    }]
                },
                {
                    role: "user",
                    parts: [{
                        text: prompt
                    }]
                }
            ],
            generationConfig: {
                temperature: parseFloat(settings.temperature),
                topP: 0.95,
                topK: 64,
                maxOutputTokens: parseInt(settings.maxTokens)
            }
        };

        // Определяем URL с учётом модели
        const modelName = settings.geminiModel || 'gemini-pro';
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${settings.geminiApiKey}`;

        // Отправляем запрос к API
        GM_xmlhttpRequest({
            method: 'POST',
            url: apiUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(requestData),
            onload: response => {
                hideLoading();

                try {
                    // // console.log("Gemini response:", response.responseText);

                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(`API ответил с кодом ${response.status}: ${response.responseText}`);
                    }

                    const jsonResponse = JSON.parse(response.responseText);

                    if (jsonResponse.candidates && jsonResponse.candidates.length > 0) {
                        const candidate = jsonResponse.candidates[0];

                        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                            const result = candidate.content.parts[0].text;

                            // Отображаем результат в AI табе
                            displayAIResult(result);

                            // Переключаемся на AI таб
                            document.querySelector(`[data-target="${PREFIX}ai-content"]`).click();

                            // Оцениваем количество токенов (примерно)
                            const inputTokens = estimateTokens(prompt);
                            const outputTokens = estimateTokens(result);

                            // Обновляем статистику Gemini
                            updateGeminiStats(inputTokens, outputTokens);

                            // Обновляем отображение статистики, если таб открыт
                            updateBillingDisplay();
                        } else {
                            throw new Error('No content parts in response');
                        }
                    } else {
                        if (jsonResponse.promptFeedback) {
                            // Проверка на блокировку из-за фильтров контента
                            throw new Error(`Content blocked: ${jsonResponse.promptFeedback.blockReason || 'Unknown reason'}`);
                        } else {
                            throw new Error('No candidates in response');
                        }
                    }
                } catch (error) {
                    console.error('Error parsing Gemini response:', error);
                    console.error('Raw response:', response.responseText);
                    alert(format(t('processingError'), error.message));
                }
            },
            onerror: error => {
                hideLoading();
                console.error('Error with Gemini API request:', error);
                alert(format(t('processingError'), error.statusText || 'Network error'));
            }
        });
    }

    // Обработка через GPT с учетом статистики
    function processWithGPT(text) {
        if (!settings.gptApiKey) {
            alert(format(t('noApiKey'), 'GPT'));
            return;
        }

        // Получаем историю сообщений
        const messages = getHistoryMessages(text);
        const messagesText = messages.join('\n\n');

        // Заменяем плейсхолдер в промпте
        const prompt = settings.mainPrompt.replace('{{text}}', messagesText);

        // Показываем индикатор загрузки
        showLoading();

        // Отправляем запрос к API
        GM_xmlhttpRequest({
            method: 'POST',
            url: settings.gptApiUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.gptApiKey}`
            },
            data: JSON.stringify({
                model: settings.gptModel,
                messages: [{
                        role: "system",
                        content: settings.systemPrompt
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: settings.temperature,
                max_tokens: settings.maxTokens
            }),
            onload: response => {
                hideLoading();

                try {
                    const jsonResponse = JSON.parse(response.responseText);
                    if (jsonResponse.choices && jsonResponse.choices.length > 0) {
                        const result = jsonResponse.choices[0].message.content;

                        // Отображаем результат в AI табе
                        displayAIResult(result);

                        // Переключаемся на AI таб
                        document.querySelector(`[data-target="${PREFIX}ai-content"]`).click();

                        // Обновляем статистику
                        // Используем точные данные из API если возможно
                        const inputTokens = jsonResponse.usage ? jsonResponse.usage.prompt_tokens : estimateTokens(prompt);
                        const outputTokens = jsonResponse.usage ? jsonResponse.usage.completion_tokens : estimateTokens(result);

                        // Обновляем статистику GPT
                        updateGPTStats(inputTokens, outputTokens);

                        // Принудительно обновляем отображение статистики
                        updateBillingDisplay();
                    } else {
                        throw new Error('No choices in response');
                    }
                } catch (error) {
                    console.error('Error parsing GPT response:', error);
                    alert(format(t('processingError'), error.message));
                }
            },
            onerror: error => {
                hideLoading();
                console.error('Error with GPT API request:', error);
                alert(format(t('processingError'), error.statusText || 'Network error'));
            }
        });
    }

    // Функция для обновления отображения статистики
    function updateBillingDisplay() {
        // Проверяем, открыт ли таб со статистикой
        const billingTab = document.getElementById(`${PREFIX}billing-content`);
        if (!billingTab || !billingTab.classList.contains(`${PREFIX}active`)) {
            return; // не обновляем, если таб не активен
        }

        // Обновляем числа в элементах статистики
        const openaiInTokens = document.querySelector(`#${PREFIX}openai-in-tokens`);
        const openaiOutTokens = document.querySelector(`#${PREFIX}openai-out-tokens`);
        const openaiTotalTokens = document.querySelector(`#${PREFIX}openai-total-tokens`);
        const googleTotalMinutes = document.querySelector(`#${PREFIX}google-total-minutes`);
        const gptInTokens = document.querySelector(`#${PREFIX}gpt-in-tokens`);
        const gptOutTokens = document.querySelector(`#${PREFIX}gpt-out-tokens`);
        const gptTotalTokens = document.querySelector(`#${PREFIX}gpt-total-tokens`);
        const geminiInTokens = document.querySelector(`#${PREFIX}gemini-in-tokens`);
        const geminiOutTokens = document.querySelector(`#${PREFIX}gemini-out-tokens`);
        const geminiTotalTokens = document.querySelector(`#${PREFIX}gemini-total-tokens`);

        if (openaiInTokens) openaiInTokens.textContent = billing.openai.inputTokens.toLocaleString();
        if (openaiOutTokens) openaiOutTokens.textContent = billing.openai.outputTokens.toLocaleString();
        if (openaiTotalTokens) openaiTotalTokens.textContent = billing.openai.totalTokens.toLocaleString();
        if (googleTotalMinutes) googleTotalMinutes.textContent = billing.google.totalMinutes.toFixed(2);
        if (gptInTokens) gptInTokens.textContent = billing.gpt.inputTokens.toLocaleString();
        if (gptOutTokens) gptOutTokens.textContent = billing.gpt.outputTokens.toLocaleString();
        if (gptTotalTokens) gptTotalTokens.textContent = billing.gpt.totalTokens.toLocaleString();
        if (geminiInTokens) geminiInTokens.textContent = billing.gemini.inputTokens.toLocaleString();
        if (geminiOutTokens) geminiOutTokens.textContent = billing.gemini.outputTokens.toLocaleString();
        if (geminiTotalTokens) geminiTotalTokens.textContent = billing.gemini.totalTokens.toLocaleString();
    }

    // Функция для отображения результата AI в соответствующем табе
    function displayAIResult(result) {
        const aiOutput = document.getElementById(`${PREFIX}ai-output`);
        if (aiOutput) {
            safeHTML(aiOutput, 'innerHTML', '');
            // Форматируем текст, сохраняя абзацы
            const paragraphs = result.split(/\n\n+/);
            paragraphs.forEach(paragraph => {
                if (paragraph.trim()) {
                    const p = document.createElement('p');
                    p.textContent = paragraph;
                    aiOutput.appendChild(p);
                }
            });

            aiOutput.scrollTop = 0;
        }
    }

    // Функция для получения истории сообщений
    function getHistoryMessages(currentText) {
        const messages = [];
        const historyCount = parseInt(settings.historyCount) || 0;

        // Добавляем сообщения из истории, если нужно
        if (historyCount > 0 && savedTexts.length > 0) {
            const recentTexts = savedTexts.slice(-historyCount);
            recentTexts.forEach(item => {
                messages.push(`[${item.date}] ${item.text}`);
            });
        }

        // Добавляем текущее сообщение
        messages.push(`USER_MESSAGE: ${currentText}`);

        return messages;
    }

    // Показать индикатор загрузки
    function showLoading() {
        const aiOutput = document.getElementById(`${PREFIX}ai-output`);
        if (aiOutput) {
            safeHTML(aiOutput, 'innerHTML', `<div style="text-align: center; padding: 20px; color: #666;">${t('processing')}</div>`);
        }

        // Переключаемся на AI таб с помощью селектора
        document.querySelector(`[data-target="${PREFIX}ai-content"]`).click();
    }

    // Скрыть индикатор загрузки
    function hideLoading() {
        const aiOutput = document.getElementById(`${PREFIX}ai-output`);
        if (aiOutput && aiOutput.innerHTML.includes(t('processing'))) {
            safeHTML(aiOutput, 'innerHTML', '');
        }
    }

    function getCopyCloseText() {
        return t('copyText') + ' & ' + t('close');
    }

    function exportSettings() {
        const exportData = {
            settings: {
                googleSpeechApiKey: settings.googleSpeechApiKey,
                openaiApiKey: settings.openaiApiKey,
                language: settings.language,
                siteList: settings.siteList,
                ttsVoice: settings.ttsVoice,
                ttsModel: settings.ttsModel,
                fontSize: settings.fontSize,
                fontFamily: settings.fontFamily,
                fontWeight: settings.fontWeight,
                lineHeight: settings.lineHeight,
                recordingStyle: settings.recordingStyle,
                forceAPI: settings.forceAPI,
                defaultAIProvider: settings.defaultAIProvider,
                gptApiKey: settings.gptApiKey,
                gptApiUrl: settings.gptApiUrl,
                geminiApiKey: settings.geminiApiKey,
                geminiApiUrl: settings.geminiApiUrl,
                geminiModel: settings.geminiModel,
                gptModel: settings.gptModel,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                systemPrompt: settings.systemPrompt,
                mainPrompt: settings.mainPrompt,
                historyCount: settings.historyCount
            },
            savedTexts: savedTexts,
            billing: billing,
            customCommands: GM_getValue('customVoiceCommands', {})
        };

        // Создаем ссылку для скачивания
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'speech-assistant-settings.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const importData = JSON.parse(event.target.result);

                    // Проверка на валидность данных
                    if (!importData.settings) {
                        throw new Error('Некорректный формат файла настроек');
                    }

                    // Обновляем настройки
                    Object.assign(settings, importData.settings);

                    // Сохраняем в GM_setValue
                    for (const [key, value] of Object.entries(importData.settings)) {
                        GM_setValue(key, value);
                    }

                    // Обновляем сохраненные тексты, если они есть
                    if (importData.savedTexts) {
                        savedTexts = importData.savedTexts;
                        GM_setValue('savedTexts', savedTexts);
                    }

                    // Обновляем статистику, если она есть
                    if (importData.billing) {
                        Object.assign(billing, importData.billing);

                        // Сохраняем статистику
                        for (const [provider, stats] of Object.entries(importData.billing)) {
                            for (const [key, value] of Object.entries(stats)) {
                                GM_setValue(`${provider}_${key}`, value);
                            }
                        }
                    }

                    // Обновляем пользовательские команды, если они есть
                    if (importData.customCommands) {
                        GM_setValue('customVoiceCommands', importData.customCommands);
                        // Обновляем активные команды
                        updateVoiceCommands();
                    }

                    alert('Настройки успешно импортированы!');

                    // Обновляем интерфейс, если он открыт
                    applyFontSettings();

                    // Обновляем язык интерфейса
                    currentUILang = settings.language;

                    // Обновляем статистику, если таб открыт
                    updateBillingDisplay();
                } catch (error) {
                    console.error('Ошибка импорта настроек:', error);
                    alert(`Ошибка импорта настроек: ${error.message}`);
                }
            };

            reader.readAsText(file);
        };

        input.click();
    }

    // Модальное окно пользовательских команд
    function showCustomCommandsModal(parentModal) {
        // Загружаем пользовательские команды
        const customCommands = GM_getValue('customVoiceCommands', {});

        // Удаляем предыдущее модальное окно, если оно есть
        const existingModal = document.querySelector(`.${PREFIX}custom-commands-modal`);
        const existingOverlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
        if (existingModal) document.body.removeChild(existingModal);
        if (existingOverlay) document.body.removeChild(existingOverlay);

        // Создаем оверлей
        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;
        document.body.appendChild(overlay);

        // Создаем модальное окно
        const modal = document.createElement('div');
        modal.className = `${PREFIX}settings-modal ${PREFIX}custom-commands-modal`;

        // Заголовок
        const header = document.createElement('div');
        header.className = `${PREFIX}modal-header`;

        const title = document.createElement('h2');
        title.textContent = t('customCommands');

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.className = `${PREFIX}btn`;
        closeButton.style.fontSize = '20px';
        closeButton.style.padding = '0 8px';
        closeButton.style.background = 'transparent';
        closeButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        header.appendChild(title);
        header.appendChild(closeButton);

        // Создаем контейнер для контента со скроллом
        const contentContainer = document.createElement('div');
        contentContainer.className = `${PREFIX}settings-modal-content`;

        // Создаем таблицу команд
        const commandsTable = document.createElement('table');
        commandsTable.style.width = '100%';
        commandsTable.style.borderCollapse = 'collapse';
        commandsTable.style.marginBottom = '20px';

        // Заголовок таблицы
        const tableHeader = document.createElement('thead');
        const headerRow = document.createElement('tr');

        const langHeader = document.createElement('th');
        langHeader.textContent = t('language');
        langHeader.style.padding = '8px';
        langHeader.style.borderBottom = '1px solid #ddd';
        langHeader.style.textAlign = 'left';

        const commandHeader = document.createElement('th');
        commandHeader.textContent = t('command');
        commandHeader.style.padding = '8px';
        commandHeader.style.borderBottom = '1px solid #ddd';
        commandHeader.style.textAlign = 'left';

        const actionHeader = document.createElement('th');
        actionHeader.textContent = t('action');
        actionHeader.style.padding = '8px';
        actionHeader.style.borderBottom = '1px solid #ddd';
        actionHeader.style.textAlign = 'left';

        const deleteHeader = document.createElement('th');
        deleteHeader.textContent = t('delete');
        deleteHeader.style.padding = '8px';
        deleteHeader.style.borderBottom = '1px solid #ddd';
        deleteHeader.style.textAlign = 'center';

        headerRow.appendChild(langHeader);
        headerRow.appendChild(commandHeader);
        headerRow.appendChild(actionHeader);
        headerRow.appendChild(deleteHeader);
        tableHeader.appendChild(headerRow);
        commandsTable.appendChild(tableHeader);

        // Тело таблицы
        const tableBody = document.createElement('tbody');
        tableBody.id = `${PREFIX}custom-commands-tbody`;

        // Заполняем таблицу пользовательскими командами
        for (const [lang, commands] of Object.entries(customCommands)) {
            for (const [command, action] of Object.entries(commands)) {
                const row = createCommandRow(lang, command, action, tableBody);
                tableBody.appendChild(row);
            }
        }

        commandsTable.appendChild(tableBody);
        contentContainer.appendChild(commandsTable);

        // Кнопка добавления новой команды
        const addButton = document.createElement('button');
        addButton.textContent = t('addCommand');
        addButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        addButton.onclick = () => {
            showAddCommandModal(tableBody);
        };

        contentContainer.appendChild(addButton);

        // Создаем футер для кнопок
        const footerContainer = document.createElement('div');
        footerContainer.className = `${PREFIX}settings-modal-footer`;

        // Кнопки для сохранения настроек
        const buttonGroup = document.createElement('div');
        buttonGroup.className = `${PREFIX}button-group`;

        const saveButton = document.createElement('button');
        saveButton.textContent = t('save');
        saveButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        saveButton.onclick = () => {
            saveCustomCommands();
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
            alert(t('customCommandsSaved'));
        };

        const cancelButton = document.createElement('button');
        cancelButton.textContent = t('cancel');
        cancelButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        cancelButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        buttonGroup.appendChild(saveButton);
        buttonGroup.appendChild(cancelButton);
        footerContainer.appendChild(buttonGroup);

        // Собираем модальное окно
        modal.appendChild(header);
        modal.appendChild(contentContainer);
        modal.appendChild(footerContainer);

        document.body.appendChild(modal);
    }

    // Функция для создания строки таблицы команд
    function createCommandRow(lang, command, action, tableBody) {
        const row = document.createElement('tr');
        row.dataset.lang = lang;
        row.dataset.command = command;
        row.dataset.action = action;

        const langCell = document.createElement('td');
        langCell.textContent = getLangName(lang);
        langCell.style.padding = '8px';
        langCell.style.borderBottom = '1px solid #eee';

        const commandCell = document.createElement('td');
        commandCell.textContent = command;
        commandCell.style.padding = '8px';
        commandCell.style.borderBottom = '1px solid #eee';

        const actionCell = document.createElement('td');
        actionCell.textContent = getActionName(action);
        actionCell.style.padding = '8px';
        actionCell.style.borderBottom = '1px solid #eee';

        const deleteCell = document.createElement('td');
        deleteCell.style.padding = '8px';
        deleteCell.style.borderBottom = '1px solid #eee';
        deleteCell.style.textAlign = 'center';

        const deleteButton = document.createElement('button');
        deleteButton.textContent = '✖';
        deleteButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        deleteButton.style.padding = '2px 6px';
        deleteButton.style.fontSize = '12px';
        deleteButton.onclick = () => {
            if (confirm(t('confirmDeleteCommand'))) {
                tableBody.removeChild(row);
            }
        };

        deleteCell.appendChild(deleteButton);

        row.appendChild(langCell);
        row.appendChild(commandCell);
        row.appendChild(actionCell);
        row.appendChild(deleteCell);

        return row;
    }

    // Получение названия языка по коду
    function getLangName(langCode) {
        const langMap = {
            'ru-RU': 'Русский',
            'en-US': 'English (US)',
            'en-GB': 'English (UK)',
            'uk-UA': 'Українська',
            'cs-CZ': 'Čeština'
        };
        return langMap[langCode] || langCode;
    }

    // Получение названия действия по коду
    function getActionName(actionCode) {
        switch (actionCode) {
            case 'clear':
                return t('clearCommand');
            case 'copy':
                return t('copyCommand');
            case 'save':
                return t('saveCommand');
            case 'stop':
                return t('stopCommand');
            case 'pause':
                return t('pauseCommand');
            case 'process':
                return t('processCommand');
            case 'period':
                return t('periodCommand');
            case 'comma':
                return t('commaCommand');
            case 'questionMark':
                return t('questionCommand');
            case 'exclamationMark':
                return t('exclamationCommand');
            case 'newLine':
                return t('newLineCommand');
            case 'capitalizeNext':
                return t('capitalizeCommand');
            default:
                return actionCode;
        }
    }

    // Модальное окно добавления новой команды
    function showAddCommandModal(tableBody) {
        // Создаем оверлей
        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;
        overlay.style.zIndex = '2147483649'; // На уровень выше других оверлеев
        document.body.appendChild(overlay);

        // Создаем модальное окно
        const modal = document.createElement('div');
        modal.className = `${PREFIX}settings-modal`;
        modal.style.zIndex = '2147483650';
        modal.style.width = '400px';

        // Заголовок
        const header = document.createElement('div');
        header.className = `${PREFIX}modal-header`;

        const title = document.createElement('h2');
        title.textContent = t('addCommand');

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.className = `${PREFIX}btn`;
        closeButton.style.fontSize = '20px';
        closeButton.style.padding = '0 8px';
        closeButton.style.background = 'transparent';
        closeButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        header.appendChild(title);
        header.appendChild(closeButton);

        // Форма добавления
        const form = document.createElement('div');
        form.style.padding = '15px';

        // Выбор языка
        const langGroup = document.createElement('div');
        langGroup.className = `${PREFIX}form-group`;

        const langLabel = document.createElement('label');
        langLabel.textContent = t('language');
        langLabel.htmlFor = `${PREFIX}command-lang`;

        const langSelect = document.createElement('select');
        langSelect.id = `${PREFIX}command-lang`;

        const languages = [{
                code: 'ru-RU',
                name: 'Русский'
            },
            {
                code: 'en-US',
                name: 'English (US)'
            },
            {
                code: 'en-GB',
                name: 'English (UK)'
            },
            {
                code: 'uk-UA',
                name: 'Українська'
            },
            {
                code: 'cs-CZ',
                name: 'Čeština'
            }
        ];

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            langSelect.appendChild(option);
        });

        langGroup.appendChild(langLabel);
        langGroup.appendChild(langSelect);

        // Поле команды
        const commandGroup = document.createElement('div');
        commandGroup.className = `${PREFIX}form-group`;

        const commandLabel = document.createElement('label');
        commandLabel.textContent = t('command');
        commandLabel.htmlFor = `${PREFIX}command-text`;

        const commandInput = document.createElement('input');
        commandInput.type = 'text';
        commandInput.id = `${PREFIX}command-text`;
        commandInput.placeholder = t('enterCommandText');

        commandGroup.appendChild(commandLabel);
        commandGroup.appendChild(commandInput);

        // Выбор действия
        const actionGroup = document.createElement('div');
        actionGroup.className = `${PREFIX}form-group`;

        const actionLabel = document.createElement('label');
        actionLabel.textContent = t('action');
        actionLabel.htmlFor = `${PREFIX}command-action`;

        const actionSelect = document.createElement('select');
        actionSelect.id = `${PREFIX}command-action`;

        const actions = [{
                code: 'clear',
                name: t('clearCommand')
            },
            {
                code: 'copy',
                name: t('copyCommand')
            },
            {
                code: 'save',
                name: t('saveCommand')
            },
            {
                code: 'stop',
                name: t('stopCommand')
            },
            {
                code: 'pause',
                name: t('pauseCommand')
            },
            {
                code: 'process',
                name: t('processCommand')
            },
            {
                code: 'period',
                name: t('periodCommand')
            },
            {
                code: 'comma',
                name: t('commaCommand')
            },
            {
                code: 'questionMark',
                name: t('questionCommand')
            },
            {
                code: 'exclamationMark',
                name: t('exclamationCommand')
            },
            {
                code: 'newLine',
                name: t('newLineCommand')
            },
            {
                code: 'capitalizeNext',
                name: t('capitalizeCommand')
            }
        ];

        actions.forEach(action => {
            const option = document.createElement('option');
            option.value = action.code;
            option.textContent = action.name;
            actionSelect.appendChild(option);
        });

        actionGroup.appendChild(actionLabel);
        actionGroup.appendChild(actionSelect);

        // Кнопки
        const buttonsGroup = document.createElement('div');
        buttonsGroup.className = `${PREFIX}button-group`;
        buttonsGroup.style.marginTop = '20px';

        const addButton = document.createElement('button');
        addButton.textContent = t('add');
        addButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        addButton.onclick = () => {
            const lang = langSelect.value;
            const command = commandInput.value.trim();
            const action = actionSelect.value;

            if (!command) {
                alert(t('enterCommandError'));
                return;
            }

            // Добавляем новую строку в таблицу
            const row = createCommandRow(lang, command, action, tableBody);
            tableBody.appendChild(row);

            // Закрываем модальное окно
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        const cancelButton = document.createElement('button');
        cancelButton.textContent = t('cancel');
        cancelButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        cancelButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        buttonsGroup.appendChild(addButton);
        buttonsGroup.appendChild(cancelButton);

        // Собираем форму
        form.appendChild(langGroup);
        form.appendChild(commandGroup);
        form.appendChild(actionGroup);
        form.appendChild(buttonsGroup);

        // Собираем модальное окно
        modal.appendChild(header);
        modal.appendChild(form);

        document.body.appendChild(modal);
    }

    // Функция сохранения пользовательских команд
    function saveCustomCommands() {
        const tableBody = document.getElementById(`${PREFIX}custom-commands-tbody`);
        if (!tableBody) return;

        const customCommands = {};

        // Собираем данные из строк таблицы
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const lang = row.dataset.lang;
            const command = row.dataset.command;
            const action = row.dataset.action;

            if (lang && command && action) {
                if (!customCommands[lang]) {
                    customCommands[lang] = {};
                }
                customCommands[lang][command] = action;
            }
        });

        // Сохраняем в хранилище
        GM_setValue('customVoiceCommands', customCommands);

        // Обновляем глобальные команды
        updateVoiceCommands();

        // Добавим отладочный вывод для проверки
        console.log('Сохранены пользовательские команды:', customCommands);
    }

    // Функция для получения содержимого инструкций в зависимости от языка
    function getInstructionsContent() {
        const lang = settings.language;
        const instructions = {
            'ru-RU': `
            <div class="${PREFIX}instructions">
                <h3>Как использовать голосовые команды</h3>
                <p>Для активации голосовой команды произнесите одно из активационных слов: <strong>Помощник</strong>, <strong>Компьютер</strong>, <strong>Ассистент</strong> или <strong>Команда</strong>, затем название команды.</p>

                <h4>Пример использования:</h4>
                <p><em>"Компьютер, поставь точку"</em> - добавит точку в конце текущего предложения.</p>

                <h4>Доступные команды:</h4>
                <ul>
                    <li><strong>Очистить</strong> - очищает весь текст в блокноте</li>
                    <li><strong>Копировать</strong> - копирует текст в буфер обмена</li>
                    <li><strong>Сохранить</strong> - сохраняет текст и закрывает окно</li>
                    <li><strong>Стоп</strong> или <strong>Остановить</strong> - останавливает запись</li>
                    <li><strong>Пауза</strong> - приостанавливает запись</li>
                    <li><strong>Обработать</strong> - отправляет текст на обработку AI</li>
                </ul>

                <h4>Команды пунктуации:</h4>
                <ul>
                    <li><strong>Точка</strong> - добавляет точку (.)</li>
                    <li><strong>Запятая</strong> - добавляет запятую (,)</li>
                    <li><strong>Вопрос</strong> - добавляет знак вопроса (?)</li>
                    <li><strong>Восклицательный знак</strong> - добавляет восклицательный знак (!)</li>
                    <li><strong>Двоеточие</strong> - добавляет двоеточие (:)</li>
                    <li><strong>Новая строка</strong> - начинает новую строку</li>
                    <li><strong>С большой буквы</strong> - следующее слово будет написано с большой буквы</li>
                </ul>

                <h4>Особые инструкции для AI:</h4>
                <p>Вы можете передать текст в фигурных скобках, произнеся после активационного слова текст, который не является командой:</p>
                <p><em>"Компьютер, запомни это важно для анализа"</em> запишет в блокнот: <code>{запомни это важно для анализа}</code></p>
                <p>Текст в фигурных скобках может служить инструкцией для AI при обработке.</p>
            </div>
        `,
            'en-US': `
            <div class="${PREFIX}instructions">
                <h3>How to Use Voice Commands</h3>
                <p>To activate a voice command, say one of the activation words: <strong>Assistant</strong>, <strong>Computer</strong>, or <strong>Command</strong>, followed by the command name.</p>

                <h4>Usage example:</h4>
                <p><em>"Computer, period"</em> - will add a period at the end of the current sentence.</p>

                <h4>Available commands:</h4>
                <ul>
                    <li><strong>Clear</strong> - clears all text in the notepad</li>
                    <li><strong>Copy</strong> - copies the text to clipboard</li>
                    <li><strong>Save</strong> - saves the text and closes the window</li>
                    <li><strong>Stop</strong> - stops recording</li>
                    <li><strong>Pause</strong> - pauses recording</li>
                    <li><strong>Process</strong> - sends the text for AI processing</li>
                </ul>

                <h4>Punctuation commands:</h4>
                <ul>
                    <li><strong>Period</strong> - adds a period (.)</li>
                    <li><strong>Comma</strong> - adds a comma (,)</li>
                    <li><strong>Question mark</strong> - adds a question mark (?)</li>
                    <li><strong>Exclamation mark</strong> - adds an exclamation mark (!)</li>
                    <li><strong>Colon</strong> - adds a colon (:)</li>
                    <li><strong>New line</strong> - starts a new line</li>
                    <li><strong>Capitalize</strong> - capitalizes the next word</li>
                </ul>

                <h4>Special instructions for AI:</h4>
                <p>You can pass text in curly braces by saying text that is not a command after the activation word:</p>
                <p><em>"Computer, remember this is important for analysis"</em> will write to the notepad: <code>{remember this is important for analysis}</code></p>
                <p>Text in curly braces can serve as an instruction for AI when processing.</p>
            </div>
        `,
            'uk-UA': `
        <div class="${PREFIX}instructions">
            <h3>Як використовувати голосові команди</h3>
            <p>Для активації голосової команди промовте одне з активаційних слів: <strong>Помічник</strong>, <strong>Комп'ютер</strong>, <strong>Асистент</strong> або <strong>Команда</strong>, потім назву команди.</p>

            <h4>Приклад використання:</h4>
            <p><em>"Комп'ютер, постав крапку"</em> - додасть крапку в кінці поточного речення.</p>

            <h4>Доступні команди:</h4>
            <ul>
                <li><strong>Очистити</strong> - очищає весь текст у блокноті</li>
                <li><strong>Копіювати</strong> - копіює текст в буфер обміну</li>
                <li><strong>Зберегти</strong> - зберігає текст і закриває вікно</li>
                <li><strong>Стоп</strong> або <strong>Зупинити</strong> - зупиняє запис</li>
                <li><strong>Пауза</strong> - призупиняє запис</li>
                <li><strong>Обробити</strong> - відправляє текст на обробку AI</li>
            </ul>

            <h4>Команди пунктуації:</h4>
            <ul>
                <li><strong>Крапка</strong> - додає крапку (.)</li>
                <li><strong>Кома</strong> - додає кому (,)</li>
                <li><strong>Знак питання</strong> - додає знак питання (?)</li>
                <li><strong>Знак оклику</strong> - додає знак оклику (!)</li>
                <li><strong>Двокрапка</strong> - додає двокрапку (:)</li>
                <li><strong>Новий рядок</strong> - починає новий рядок</li>
                <li><strong>З великої літери</strong> - наступне слово буде написано з великої літери</li>
            </ul>

            <h4>Особливі інструкції для AI:</h4>
            <p>Ви можете передати текст у фігурних дужках, промовивши після активаційного слова текст, який не є командою:</p>
            <p><em>"Комп'ютер, запам'ятай це важливо для аналізу"</em> запише в блокнот: <code>{запам'ятай це важливо для аналізу}</code></p>
            <p>Текст у фігурних дужках може служити інструкцією для AI при обробці.</p>
        </div>
    `,
            'cs-CZ': `
        <div class="${PREFIX}instructions">
            <h3>Jak používat hlasové příkazy</h3>
            <p>Pro aktivaci hlasového příkazu řekněte jedno z aktivačních slov: <strong>Asistent</strong>, <strong>Počítač</strong> nebo <strong>Příkaz</strong>, následováno názvem příkazu.</p>

            <h4>Příklad použití:</h4>
            <p><em>"Počítač, tečka"</em> - přidá tečku na konec aktuální věty.</p>

            <h4>Dostupné příkazy:</h4>
            <ul>
                <li><strong>Vymazat</strong> - vymaže veškerý text v poznámkovém bloku</li>
                <li><strong>Kopírovat</strong> - zkopíruje text do schránky</li>
                <li><strong>Uložit</strong> - uloží text a zavře okno</li>
                <li><strong>Stop</strong> nebo <strong>Zastavit</strong> - zastaví nahrávání</li>
                <li><strong>Pauza</strong> - pozastaví nahrávání</li>
                <li><strong>Zpracovat</strong> - odešle text ke zpracování AI</li>
            </ul>

            <h4>Příkazy interpunkce:</h4>
            <ul>
                <li><strong>Tečka</strong> - přidá tečku (.)</li>
                <li><strong>Čárka</strong> - přidá čárku (,)</li>
                <li><strong>Otazník</strong> - přidá otazník (?)</li>
                <li><strong>Vykřičník</strong> - přidá vykřičník (!)</li>
                <li><strong>Dvojtečka</strong> - přidá dvojtečku (:)</li>
                <li><strong>Nový řádek</strong> - začne nový řádek</li>
                <li><strong>Velké písmeno</strong> - následující slovo bude napsáno s velkým písmenem</li>
            </ul>

            <h4>Speciální instrukce pro AI:</h4>
            <p>Můžete předat text ve složených závorkách vyslovením textu, který není příkazem, po aktivačním slově:</p>
            <p><em>"Počítač, zapamatuj si to je důležité pro analýzu"</em> zapíše do bloku: <code>{zapamatuj si to je důležité pro analýzu}</code></p>
            <p>Text ve složených závorkách může sloužit jako instrukce pro AI při zpracování.</p>
        </div>
    `
        };

        return instructions[lang] || instructions['ru-RU'];
    }

    // Функция для обновления словарей голосовых команд с учетом пользовательских
    function updateVoiceCommands() {
        const customCommands = GM_getValue('customVoiceCommands', {});
        console.log('Загружены пользовательские команды:', customCommands);

        // Добавляем/заменяем пользовательские команды
        for (const [lang, commands] of Object.entries(customCommands)) {
            if (!VOICE_COMMANDS[lang]) {
                VOICE_COMMANDS[lang] = {};
            }

            for (const [command, action] of Object.entries(commands)) {
                VOICE_COMMANDS[lang][command] = action;
            }
        }

        console.log('Обновленные команды:', VOICE_COMMANDS);
    }

    function isMobileDevice() {
        return (typeof window.orientation !== "undefined") ||
            (navigator.userAgent.indexOf('IEMobile') !== -1) ||
            (navigator.userAgent.indexOf('Android') !== -1 &&
                navigator.userAgent.indexOf('Mobile') !== -1) ||
            (navigator.userAgent.indexOf('iPhone') !== -1) ||
            (navigator.userAgent.indexOf('iPad') !== -1);
    }

    // В функции createSpeechModal() добавляем проверку на мобильное устройство
    // и адаптируем интерфейс
    if (isMobileDevice()) {
        // Адаптируем стили для мобильных устройств
        modal.style.width = '90%';
        modal.style.height = '80%';
        modal.style.maxWidth = '500px';

        // Увеличиваем размер кнопок для удобства на тачскрине
        const allButtons = modal.querySelectorAll(`.${PREFIX}btn`);
        allButtons.forEach(btn => {
            btn.style.padding = '10px 16px';
            btn.style.fontSize = '16px';
            btn.style.margin = '3px';
        });

        // Позиционируем индикатор громкости иначе
        const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
        if (volumeMeter) {
            volumeMeter.style.bottom = '120px';
            volumeMeter.style.right = '10px';
        }
    }

    function fullStopRecording() {
        // Останавливаем любые активные процессы записи
        if (isRecording) {
            isRecording = false;
            isPaused = false;

            // Останавливаем Web Speech API
            if (window.recognition) {
                try {
                    window.recognition.stop();
                } catch (e) {
                    console.warn('Ошибка при остановке recognition:', e);
                }
            }

            // Останавливаем аудиопоток
            if (window.speechStream) {
                window.speechStream.getTracks().forEach(track => {
                    track.stop();
                });
            }

            // Отключаем процессор и другие аудио-узлы
            if (window.speechProcessor) {
                try {
                    window.speechProcessor.disconnect();
                } catch (e) {
                    console.warn('Ошибка при отключении speechProcessor:', e);
                }
            }

            // Скрываем индикаторы
            const recordingIndicator = document.querySelector(`.${PREFIX}recording-indicator`);
            const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
            const startButton = document.getElementById(`${PREFIX}start-recording`);
            const pauseButton = document.getElementById(`${PREFIX}pause-recording`);

            if (recordingIndicator) {
                recordingIndicator.style.display = 'none';
            }

            if (volumeMeter) {
                volumeMeter.style.display = 'none';
            }

            if (startButton) {
                startButton.textContent = t('startRecording');
                startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
            }

            if (pauseButton) {
                pauseButton.style.display = 'none';
            }

            // Сбрасываем глобальные переменные
            window.recognition = null;
            window.speechStream = null;
            window.speechProcessor = null;
        }
    }

    // Защита от конфликтов стилей при повторном добавлении скрипта
    if (!window[`${PREFIX}initialized`]) {
        window[`${PREFIX}initialized`] = true;

        // Добавляем кнопку при загрузке страницы
        addAssistantButton();

        // Используем MutationObserver для отслеживания изменений DOM очень осторожно
        let observerActive = true;

        const observer = new MutationObserver((mutations) => {
            if (!observerActive || buttonAdded) return;

            // Временно отключаем наблюдатель для предотвращения циклов
            observerActive = false;

            // Проверяем наличие кнопки
            if (!document.getElementById(`${PREFIX}speech-assistant-button`)) {
                debug('Кнопка не найдена, добавляем заново');
                buttonAdded = false;
                addAssistantButton();
            }

            // Включаем наблюдатель обратно через небольшую задержку
            setTimeout(() => {
                observerActive = true;
            }, 100);
        });

        // Начинаем наблюдение за DOM с сниженной частотой
        observer.observe(document.body, {
            childList: true,
            subtree: false
        });

        // Еще раз проверяем наличие кнопки через некоторое время
        setTimeout(() => {
            if (!document.getElementById(`${PREFIX}speech-assistant-button`)) {
                buttonAdded = false;
                addAssistantButton();
            }
        }, 2000);
    } else {
        debug('Скрипт уже инициализирован');
    }

    // Сообщение в консоль для подтверждения загрузки скрипта
    debug('Скрипт Speech Assistant успешно загружен');
})();