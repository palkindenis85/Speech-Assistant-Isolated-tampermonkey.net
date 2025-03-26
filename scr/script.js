// ==UserScript==
// @name         Speech Assistant Isolated
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Изолированный голосовой помощник с распознаванием речи
// @author       Palkin Denys
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js
// ==/UserScript==

(function () {
    'use strict';

    // ========================
    // ОСНОВНЫЕ НАСТРОЙКИ
    // ========================
    const PREFIX = `speech_assist_${Math.random().toString(36).substring(2, 10)}_`;

    // Флаг инициализации
    if (window[`${PREFIX}initialized`]) return;
    window[`${PREFIX}initialized`] = true;

    // Защита от XSS с использованием Trusted Types если доступно
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        window.myPolicy = window.trustedTypes.createPolicy('myPolicy', {
            createHTML: (string) => DOMPurify.sanitize(string),
            createScript: (string) => string,
            createScriptURL: (string) => string
        });
    }

    // Флаги состояния записи
    let isRecording = false;
    let isPaused = false;
    let buttonAdded = false;
    let lastProcessedText = '';
    let commandActivated = false;
    let activationTimestamp = 0;
    let pendingCommandCleanup = false;
    let commandCleanupTimer = null;
    let capitalizeNextWord = false;
    let processedCommands = [];

    // Текущий текст, строка и буфер
    let currentText = [];
    let currentLine = '';
    let currentTextBuffer = [];

    // ========================
    // НАСТРОЙКИ И ХРАНЕНИЕ
    // ========================

    // Загрузка настроек из хранилища
    const settings = {
        openaiApiKey: GM_getValue('openaiApiKey', ''),
        language: GM_getValue('language', 'ru-RU'),
        activationWord: GM_getValue('activationWord', ''),
        siteList: GM_getValue('siteList', 'claude.ai,chat.openai.com'),
        ttsVoice: GM_getValue('ttsVoice', 'alloy'),
        ttsModel: GM_getValue('ttsModel', 'tts-1'),
        fontSize: GM_getValue('fontSize', '16'),
        fontFamily: GM_getValue('fontFamily', 'Courier New'),
        fontWeight: GM_getValue('fontWeight', '500'),
        lineHeight: GM_getValue('lineHeight', '24'),
        defaultAIProvider: GM_getValue('defaultAIProvider', 'gpt'),
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

    // Если активационное слово не задано, установим значение по умолчанию для текущего языка
    if (!settings.activationWord) {
        const defaultWords = {
            'ru-RU': 'компьютер',
            'en-US': 'computer',
            'uk-UA': 'комп\'ютер',
            'cs-CZ': 'počítač'
        };
        settings.activationWord = defaultWords[settings.language] || 'компьютер';
        GM_setValue('activationWord', settings.activationWord);
    }

    // Сохраненные тексты
    let savedTexts = GM_getValue('savedTexts', []);

    // Статистика использования API
    const billing = {
        openai: {
            totalTokens: GM_getValue('openai_totalTokens', 0),
            inputTokens: GM_getValue('openai_inputTokens', 0),
            outputTokens: GM_getValue('openai_outputTokens', 0)
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

    // Текущий язык интерфейса
    let currentUILang = settings.language;

    // ========================
    // ГОЛОСОВЫЕ КОМАНДЫ
    // ========================

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

    // Обновление команд с учетом пользовательских настроек
    updateVoiceCommands();

    // ========================
    // ПЕРЕВОДЫ ИНТЕРФЕЙСА
    // ========================

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
            openaiKey: 'OpenAI API Key',
            language: 'Язык распознавания',
            activationWord: 'Слово активации',
            sites: 'Сайты для TTS (через запятую)',
            voice: 'Голос OpenAI TTS',
            model: 'Модель OpenAI TTS',
            fontSettings: 'Настройки шрифта',
            font: 'Шрифт',
            fontSize: 'Размер шрифта',
            fontWeight: 'Толщина шрифта',
            lineHeight: 'Высота строки (px)',
            recordingStyle: 'Стиль распознавания',
            billingStats: 'Статистика использования',
            openaiTokens: 'Токены OpenAI',
            totalTokens: 'Всего токенов:',
            inTokens: 'Входящие:',
            outTokens: 'Исходящие:',
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
            gptTokens: 'Токены GPT',
            geminiTokens: 'Токены Gemini',
            aiTokensUsage: 'Использование AI токенов',
            customCommands: 'Пользовательские команды',
            addCommand: 'Добавить команду',
            command: 'Команда',
            action: 'Действие',
            add: 'Добавить',
            confirmDeleteCommand: 'Вы уверены, что хотите удалить эту команду?',
            enterCommandText: 'Введите текст команды',
            enterCommandError: 'Пожалуйста, введите текст команды',
            customCommandsSaved: 'Пользовательские команды сохранены',
            clearCommand: 'Очистить',
            copyCommand: 'Копировать',
            saveCommand: 'Сохранить',
            stopCommand: 'Остановить',
            pauseCommand: 'Пауза',
            processCommand: 'Обработать',
            periodCommand: 'Точка',
            commaCommand: 'Запятая',
            questionCommand: 'Вопросительный знак',
            exclamationCommand: 'Восклицательный знак',
            newLineCommand: 'Новая строка',
            capitalizeCommand: 'С большой буквы',
            colonCommand: 'Двоеточие',
            instructionsTab: 'Инструкции',
            darkMode: 'Тёмная тема',
            exportSettings: 'Экспорт настроек',
            importSettings: 'Импорт настроек',
            settingsImported: 'Настройки успешно импортированы!',
            invalidSettingsFile: 'Некорректный формат файла настроек'
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
            openaiKey: 'OpenAI API Key',
            language: 'Recognition Language',
            activationWord: 'Activation Word',
            sites: 'Sites for TTS (comma separated)',
            voice: 'OpenAI TTS Voice',
            model: 'OpenAI TTS Model',
            fontSettings: 'Font Settings',
            font: 'Font',
            fontSize: 'Font Size',
            fontWeight: 'Font Weight',
            lineHeight: 'Line Height (px)',
            recordingStyle: 'Recognition Style',
            billingStats: 'Usage Statistics',
            openaiTokens: 'OpenAI Tokens',
            totalTokens: 'Total tokens:',
            inTokens: 'Input:',
            outTokens: 'Output:',
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
            gptTokens: 'GPT Tokens',
            geminiTokens: 'Gemini Tokens',
            aiTokensUsage: 'AI Tokens Usage',
            customCommands: 'Custom Commands',
            addCommand: 'Add Command',
            command: 'Command',
            action: 'Action',
            add: 'Add',
            confirmDeleteCommand: 'Are you sure you want to delete this command?',
            enterCommandText: 'Enter command text',
            enterCommandError: 'Please enter command text',
            customCommandsSaved: 'Custom commands saved',
            clearCommand: 'Clear',
            copyCommand: 'Copy',
            saveCommand: 'Save',
            stopCommand: 'Stop',
            pauseCommand: 'Pause',
            processCommand: 'Process',
            periodCommand: 'Period',
            commaCommand: 'Comma',
            questionCommand: 'Question mark',
            exclamationCommand: 'Exclamation mark',
            newLineCommand: 'New line',
            capitalizeCommand: 'Capitalize',
            colonCommand: 'Colon',
            instructionsTab: 'Instructions',
            darkMode: 'Dark Mode',
            exportSettings: 'Export Settings',
            importSettings: 'Import Settings',
            settingsImported: 'Settings imported successfully!',
            invalidSettingsFile: 'Invalid settings file format'
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
            openaiKey: 'OpenAI API Ключ',
            language: 'Мова розпізнавання',
            activationWord: 'Слово активації',
            sites: 'Сайти для TTS (через кому)',
            voice: 'Голос OpenAI TTS',
            model: 'Модель OpenAI TTS',
            fontSettings: 'Налаштування шрифту',
            font: 'Шрифт',
            fontSize: 'Розмір шрифту',
            fontWeight: 'Товщина шрифту',
            lineHeight: 'Висота рядка (px)',
            recordingStyle: 'Стиль розпізнавання',
            billingStats: 'Статистика використання',
            openaiTokens: 'Токени OpenAI',
            totalTokens: 'Всього токенів:',
            inTokens: 'Вхідні:',
            outTokens: 'Вихідні:',
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
            gptTokens: 'Токени GPT',
            geminiTokens: 'Токени Gemini',
            aiTokensUsage: 'Використання AI токенів',
            customCommands: 'Користувацькі команди',
            addCommand: 'Додати команду',
            command: 'Команда',
            action: 'Дія',
            add: 'Додати',
            confirmDeleteCommand: 'Ви впевнені, що хочете видалити цю команду?',
            enterCommandText: 'Введіть текст команди',
            enterCommandError: 'Будь ласка, введіть текст команди',
            customCommandsSaved: 'Користувацькі команди збережено',
            clearCommand: 'Очистити',
            copyCommand: 'Копіювати',
            saveCommand: 'Зберегти',
            stopCommand: 'Зупинити',
            pauseCommand: 'Пауза',
            processCommand: 'Обробити',
            periodCommand: 'Крапка',
            commaCommand: 'Кома',
            questionCommand: 'Знак питання',
            exclamationCommand: 'Знак оклику',
            newLineCommand: 'Новий рядок',
            capitalizeCommand: 'З великої літери',
            colonCommand: 'Двокрапка',
            instructionsTab: 'Інструкції',
            darkMode: 'Темна тема',
            exportSettings: 'Експорт налаштувань',
            importSettings: 'Імпорт налаштувань',
            settingsImported: 'Налаштування успішно імпортовано!',
            invalidSettingsFile: 'Некоректний формат файлу налаштувань'
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
            openaiKey: 'OpenAI API Klíč',
            language: 'Jazyk rozpoznávání',
            activationWord: 'Aktivační slovo',
            sites: 'Stránky pro TTS (oddělené čárkou)',
            voice: 'Hlas OpenAI TTS',
            model: 'Model OpenAI TTS',
            fontSettings: 'Nastavení písma',
            font: 'Písmo',
            fontSize: 'Velikost písma',
            fontWeight: 'Tloušťka písma',
            lineHeight: 'Výška řádku (px)',
            recordingStyle: 'Styl rozpoznávání',
            billingStats: 'Statistika využití',
            openaiTokens: 'Tokeny OpenAI',
            totalTokens: 'Celkem tokenů:',
            inTokens: 'Vstupní:',
            outTokens: 'Výstupní:',
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
            gptTokens: 'GPT Tokeny',
            geminiTokens: 'Gemini Tokeny',
            aiTokensUsage: 'Využití AI tokenů',
            customCommands: 'Vlastní příkazy',
            addCommand: 'Přidat příkaz',
            command: 'Příkaz',
            action: 'Akce',
            add: 'Přidat',
            confirmDeleteCommand: 'Jste si jisti, že chcete smazat tento příkaz?',
            enterCommandText: 'Zadejte text příkazu',
            enterCommandError: 'Prosím, zadejte text příkazu',
            customCommandsSaved: 'Vlastní příkazy uloženy',
            clearCommand: 'Vymazat',
            copyCommand: 'Kopírovat',
            saveCommand: 'Uložit',
            stopCommand: 'Zastavit',
            pauseCommand: 'Pauza',
            processCommand: 'Zpracovat',
            periodCommand: 'Tečka',
            commaCommand: 'Čárka',
            questionCommand: 'Otazník',
            exclamationCommand: 'Vykřičník',
            newLineCommand: 'Nový řádek',
            capitalizeCommand: 'Velké písmeno',
            colonCommand: 'Dvojtečka',
            instructionsTab: 'Instrukce',
            darkMode: 'Tmavý režim',
            exportSettings: 'Exportovat nastavení',
            importSettings: 'Importovat nastavení',
            settingsImported: 'Nastavení úspěšně importováno!',
            invalidSettingsFile: 'Neplatný formát souboru nastavení'
        }
    };

    // ========================
    // СТИЛИ
    // ========================

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
            color: #ffffff !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}notepad-lines {
            line-height: 24px !important;
            background-image: linear-gradient(#444 1px, transparent 1px) !important;
            background-size: 100% 24px !important;
            padding: 0 !important;
            margin: 0 !important;
            height: 320px !important;
        }

        .${PREFIX}speech-modal.dark-mode .${PREFIX}button-footer {
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            padding: 15px 20px !important;
            background-color: #222222 !important;
            border-top: 1px solid #444 !important;
            display: flex !important;
            gap: 10px !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            z-index: 10 !important;
        }
    `;

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
            padding-bottom: 70px !important;
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
            max-height: 80vh !important;
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

        #${PREFIX}pause-recording {
            display: none !important;
        }

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

        .${PREFIX}notepad[data-recording-state="idle"] {
            border-left: 3px solid #4285f4 !important;
        }
        
        .${PREFIX}notepad[data-recording-state="recording"] {
            border-left: 3px solid #ea4335 !important;
        }
    `;

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
     .${PREFIX}read-button-positioned {
        top: var(--button-top) !important;
        left: var(--button-left) !important;
    }
    `;

    const styles = `
        ${mainStyles}
        ${darkModeStyles}
        ${recordingControlsStyles}
    `;



    // ========================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ========================

    // Перевод
    function t(key) {
        if (translations[currentUILang] && translations[currentUILang][key]) {
            return translations[currentUILang][key];
        }

        if (translations['ru-RU'] && translations['ru-RU'][key]) {
            return translations['ru-RU'][key];
        }

        return key;
    }

    // Форматирование строки с параметрами
    function format(str, ...args) {
        return str.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] !== 'undefined' ? args[number] : match;
        });
    }

    // Безопасная работа с HTML
    // Безопасная работа с HTML
    function safeHTML(element, method, htmlString, options = {}) {
        if (window.myPolicy) {
            switch (method) {
                case 'innerHTML':
                    element.innerHTML = window.myPolicy.createHTML(htmlString);
                    break;
                case 'outerHTML':
                    element.outerHTML = window.myPolicy.createHTML(htmlString);
                    break;
                case 'insertAdjacentHTML':
                    if (arguments.length === 4 && typeof arguments[2] === 'string') {
                        element.insertAdjacentHTML(arguments[2], window.myPolicy.createHTML(arguments[3]));
                    } else if (options.position) {
                        element.insertAdjacentHTML(options.position, window.myPolicy.createHTML(htmlString));
                    } else {
                        console.error('safeHTML: insertAdjacentHTML requires a position argument.');
                    }
                    break;
                case 'textContent':
                    element.textContent = htmlString;
                    break;
                case 'addStyles':
                    // Добавляем классы вместо inline-стилей
                    if (options.styles) {
                        Object.keys(options.styles).forEach(className => {
                            element.classList.add(`${PREFIX}${className}`);
                        });
                    }
                    if (options.cssText) {
                        // Для совместимости со старым кодом - создаем стиль в head
                        const styleId = `${PREFIX}dynamic-style-${Math.random().toString(36).substring(2, 10)}`;
                        let styleEl = document.getElementById(styleId);

                        if (!styleEl) {
                            styleEl = document.createElement('style');
                            styleEl.id = styleId;
                            document.head.appendChild(styleEl);
                        }

                        // Применяем стили к нашему элементу через селектор с ID
                        if (!element.id) {
                            element.id = `${PREFIX}el-${Math.random().toString(36).substring(2, 10)}`;
                        }
                        styleEl.textContent = `#${element.id} { ${options.cssText} }`;
                    }
                    break;
                case 'addAttributes':
                    // Безопасное добавление атрибутов
                    if (options.attributes) {
                        Object.keys(options.attributes).forEach(attr => {
                            if (attr !== 'style') { // Игнорируем style атрибут
                                element.setAttribute(attr, options.attributes[attr]);
                            }
                        });
                    }
                    break;
                default:
                    console.error('safeHTML: Unsupported method:', method);
            }
        } else {
            switch (method) {
                case 'innerHTML':
                    element.innerHTML = DOMPurify.sanitize(htmlString);
                    break;
                case 'outerHTML':
                    element.outerHTML = DOMPurify.sanitize(htmlString);
                    break;
                case 'insertAdjacentHTML':
                    if (arguments.length === 4 && typeof arguments[2] === 'string') {
                        element.insertAdjacentHTML(arguments[2], DOMPurify.sanitize(arguments[3]));
                    } else if (options.position) {
                        element.insertAdjacentHTML(options.position, DOMPurify.sanitize(htmlString));
                    }
                    break;
                case 'textContent':
                    element.textContent = htmlString;
                    break;
                case 'addStyles':
                    // Добавляем классы вместо inline-стилей
                    if (options.styles) {
                        Object.keys(options.styles).forEach(className => {
                            element.classList.add(`${PREFIX}${className}`);
                        });
                    }
                    if (options.cssText) {
                        // Для совместимости со старым кодом - создаем стиль в head
                        const styleId = `${PREFIX}dynamic-style-${Math.random().toString(36).substring(2, 10)}`;
                        let styleEl = document.getElementById(styleId);

                        if (!styleEl) {
                            styleEl = document.createElement('style');
                            styleEl.id = styleId;
                            document.head.appendChild(styleEl);
                        }

                        // Применяем стили к нашему элементу через селектор с ID
                        if (!element.id) {
                            element.id = `${PREFIX}el-${Math.random().toString(36).substring(2, 10)}`;
                        }
                        styleEl.textContent = `#${element.id} { ${options.cssText} }`;
                    }
                    break;
                case 'addAttributes':
                    // Безопасное добавление атрибутов
                    if (options.attributes) {
                        Object.keys(options.attributes).forEach(attr => {
                            if (attr !== 'style') { // Игнорируем style атрибут
                                element.setAttribute(attr, options.attributes[attr]);
                            }
                        });
                    }
                    break;
                default:
                    console.error('safeHTML: Unsupported method:', method);
            }
        }
    }

    // Обновление статистики OpenAI
    function updateOpenAIStats(inputTokens, outputTokens) {
        billing.openai.inputTokens += inputTokens;
        billing.openai.outputTokens += outputTokens;
        billing.openai.totalTokens = billing.openai.inputTokens + billing.openai.outputTokens;

        GM_setValue('openai_inputTokens', billing.openai.inputTokens);
        GM_setValue('openai_outputTokens', billing.openai.outputTokens);
        GM_setValue('openai_totalTokens', billing.openai.totalTokens);
    }

    // Обновление статистики GPT
    function updateGPTStats(inputTokens, outputTokens) {
        billing.gpt.inputTokens += inputTokens;
        billing.gpt.outputTokens += outputTokens;
        billing.gpt.totalTokens = billing.gpt.inputTokens + billing.gpt.outputTokens;

        GM_setValue('gpt_inputTokens', billing.gpt.inputTokens);
        GM_setValue('gpt_outputTokens', billing.gpt.outputTokens);
        GM_setValue('gpt_totalTokens', billing.gpt.totalTokens);
    }

    // Обновление статистики Gemini
    function updateGeminiStats(inputTokens, outputTokens) {
        billing.gemini.inputTokens += inputTokens;
        billing.gemini.outputTokens += outputTokens;
        billing.gemini.totalTokens = billing.gemini.inputTokens + billing.gemini.outputTokens;

        GM_setValue('gemini_inputTokens', billing.gemini.inputTokens);
        GM_setValue('gemini_outputTokens', billing.gemini.outputTokens);
        GM_setValue('gemini_totalTokens', billing.gemini.totalTokens);
    }

    // Сброс статистики API
    function resetBillingStats() {
        billing.openai.totalTokens = 0;
        billing.openai.inputTokens = 0;
        billing.openai.outputTokens = 0;
        billing.gpt.totalTokens = 0;
        billing.gpt.inputTokens = 0;
        billing.gpt.outputTokens = 0;
        billing.gemini.totalTokens = 0;
        billing.gemini.inputTokens = 0;
        billing.gemini.outputTokens = 0;

        GM_setValue('openai_totalTokens', 0);
        GM_setValue('openai_inputTokens', 0);
        GM_setValue('openai_outputTokens', 0);
        GM_setValue('gpt_totalTokens', 0);
        GM_setValue('gpt_inputTokens', 0);
        GM_setValue('gpt_outputTokens', 0);
        GM_setValue('gemini_totalTokens', 0);
        GM_setValue('gemini_inputTokens', 0);
        GM_setValue('gemini_outputTokens', 0);
    }

    // Обновление отображения статистики
    function updateBillingDisplay() {
        const billingTab = document.getElementById(`${PREFIX}billing-content`);
        if (!billingTab || !billingTab.classList.contains(`${PREFIX}active`)) {
            return;
        }

        const openaiInTokens = document.querySelector(`#${PREFIX}openai-in-tokens`);
        const openaiOutTokens = document.querySelector(`#${PREFIX}openai-out-tokens`);
        const openaiTotalTokens = document.querySelector(`#${PREFIX}openai-total-tokens`);
        const gptInTokens = document.querySelector(`#${PREFIX}gpt-in-tokens`);
        const gptOutTokens = document.querySelector(`#${PREFIX}gpt-out-tokens`);
        const gptTotalTokens = document.querySelector(`#${PREFIX}gpt-total-tokens`);
        const geminiInTokens = document.querySelector(`#${PREFIX}gemini-in-tokens`);
        const geminiOutTokens = document.querySelector(`#${PREFIX}gemini-out-tokens`);
        const geminiTotalTokens = document.querySelector(`#${PREFIX}gemini-total-tokens`);

        if (openaiInTokens) openaiInTokens.textContent = billing.openai.inputTokens.toLocaleString();
        if (openaiOutTokens) openaiOutTokens.textContent = billing.openai.outputTokens.toLocaleString();
        if (openaiTotalTokens) openaiTotalTokens.textContent = billing.openai.totalTokens.toLocaleString();
        if (gptInTokens) gptInTokens.textContent = billing.gpt.inputTokens.toLocaleString();
        if (gptOutTokens) gptOutTokens.textContent = billing.gpt.outputTokens.toLocaleString();
        if (gptTotalTokens) gptTotalTokens.textContent = billing.gpt.totalTokens.toLocaleString();
        if (geminiInTokens) geminiInTokens.textContent = billing.gemini.inputTokens.toLocaleString();
        if (geminiOutTokens) geminiOutTokens.textContent = billing.gemini.outputTokens.toLocaleString();
        if (geminiTotalTokens) geminiTotalTokens.textContent = billing.gemini.totalTokens.toLocaleString();
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

        ttsControls.appendChild(pauseButton);
        ttsControls.appendChild(stopButton);

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

    // Применение настроек шрифта
    function applyFontSettings() {
        settings.fontFamily = GM_getValue('fontFamily', settings.fontFamily);
        settings.fontSize = GM_getValue('fontSize', settings.fontSize);
        settings.fontWeight = GM_getValue('fontWeight', settings.fontWeight);
        settings.lineHeight = GM_getValue('lineHeight', settings.lineHeight);

        const notepad = document.getElementById(`${PREFIX}notepad`);
        if (notepad) {
            notepad.style.setProperty('font-family', settings.fontFamily, 'important');
            notepad.style.setProperty('font-size', `${settings.fontSize}px`, 'important');
            notepad.style.setProperty('font-weight', settings.fontWeight, 'important');
            notepad.style.setProperty('line-height', `${settings.lineHeight}px`, 'important');
            notepad.style.setProperty('background-size', `100% ${settings.lineHeight}px`, 'important');
        }
    }

    // Получение текста из блокнота
    function getNotepadText(notepad) {
        return Array.from(notepad.childNodes)
            .map(node => node.textContent || '')
            .join('\n');
    }

    // Сохранение текущего текста
    function saveCurrentText() {
        if (currentText.length > 0 || currentLine.trim() !== '' || currentTextBuffer.length > 0) {
            const fullText = [...currentText];

            if (currentLine.trim() !== '') {
                fullText.push(currentLine);
            }

            if (currentTextBuffer.length > 0) {
                fullText.push(currentTextBuffer.join(' '));
            }

            if (fullText.length > 0) {
                savedTexts.push({
                    date: new Date().toLocaleString(),
                    text: fullText.join('\n')
                });
                GM_setValue('savedTexts', savedTexts);
            }

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

    // Определение типа устройства
    function isMobileDevice() {
        return (typeof window.orientation !== "undefined") ||
            (navigator.userAgent.indexOf('IEMobile') !== -1) ||
            (navigator.userAgent.indexOf('Android') !== -1 &&
                navigator.userAgent.indexOf('Mobile') !== -1) ||
            (navigator.userAgent.indexOf('iPhone') !== -1) ||
            (navigator.userAgent.indexOf('iPad') !== -1);
    }

    // Приблизительный подсчет токенов
    function estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    // ========================
    // ГОЛОСОВОЕ РАСПОЗНАВАНИЕ
    // ========================

    // Обновление голосовых команд
    function updateVoiceCommands() {
        const customCommands = GM_getValue('customVoiceCommands', {});

        for (const [lang, commands] of Object.entries(customCommands)) {
            if (!VOICE_COMMANDS[lang]) {
                VOICE_COMMANDS[lang] = {};
            }

            for (const [command, action] of Object.entries(commands)) {
                VOICE_COMMANDS[lang][command] = action;
            }
        }
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

        readButton.classList.add(`${PREFIX}read-button-positioned`);
        readButton.style.setProperty('--button-top', `${window.scrollY + rect.bottom + 5}px`);
        readButton.style.setProperty('--button-left', `${window.scrollX + rect.left}px`);

        // Сохраняем текст для TTS
        const selectedText = selection.toString().trim();

        // Добавляем обработчик для кнопки
        readButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            speakText(selectedText);
            readButton.remove();
        };

        document.body.appendChild(readButton);
    }

    // Слушаем выделение текста, но с ограничением частоты вызовов
    let selectionTimeout = null;
    document.addEventListener('mouseup', () => {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(handleTextSelection, 200);
    });

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


    // Показать индикатор команды
    function showCommandIndicator(command) {
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
        indicator.textContent = `${t('command')}: ${command}`;

        document.body.appendChild(indicator);

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

    // Вставка знака пунктуации
    function insertPunctuation(mark) {

        const notepad = document.getElementById(`${PREFIX}notepad`);
        if (!notepad) return;

        const lastLine = notepad.lastChild;
        if (!lastLine) return;

        let currentText = lastLine.textContent || '';

        // Удаляем пробел перед знаком пунктуации, если он есть
        if (currentText.endsWith(' ')) {
            currentText = currentText.slice(0, -1);
        }

        // Удаляем пробел в конце строки, если он есть
        currentText = currentText.replace(/\s+$/, '');

        // Добавляем знак пунктуации БЕЗ пробела
        lastLine.textContent = currentText + mark;

    }

    // Вставка новой строки
    function insertNewLine() {
        const notepad = document.getElementById(`${PREFIX}notepad`);
        if (!notepad) return;

        if (currentTextBuffer.length > 0) {
            currentText.push(currentTextBuffer.join(' '));
            currentTextBuffer = [];
        }

        // Затем добавляем новую строку
        const newLine = document.createElement('div');
        newLine.className = `${PREFIX}notepad-line`;
        notepad.appendChild(newLine);

        notepad.scrollTop = notepad.scrollHeight;
    }

    // Установка флага капитализации следующего слова
    function setCapitalizeNextWord(value) {
        capitalizeNextWord = value;
    }

    // Очистка устаревших команд
    function cleanupExpiredCommands() {
        const now = Date.now();
        const COMMAND_EXPIRATION_TIME = 5000;
        processedCommands = processedCommands.filter(cmd =>
            (now - cmd.timestamp) < COMMAND_EXPIRATION_TIME
        );
    }

    // Очистка текста от команд
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

    // ========================
    // ИНТЕРФЕЙС И УПРАВЛЕНИЕ
    // ========================

    // Добавление стилей
    function addIsolatedStyles() {
        try {
            const styleEl = document.createElement('style');
            styleEl.id = `${PREFIX}styles`;
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);
        } catch (e) {
            console.warn('Не удалось добавить стили напрямую из-за CSP, пробуем альтернативный метод');

            try {
                const shadowHost = document.createElement('div');
                shadowHost.id = `${PREFIX}shadow-host`;
                shadowHost.style.display = 'none';
                document.body.appendChild(shadowHost);

                const shadowRoot = shadowHost.attachShadow({
                    mode: 'open'
                });

                const styleEl = document.createElement('style');
                styleEl.textContent = styles;
                shadowRoot.appendChild(styleEl);

                window[`${PREFIX}shadowRoot`] = shadowRoot;
            } catch (shadowError) {
                console.error('Не удалось создать shadow DOM для обхода CSP', shadowError);

                if (typeof GM_addStyle === 'function') {
                    GM_addStyle(styles);
                }
            }
        }
    }

    // Создание фиксированных кнопок записи
    function createFixedRecordingControls() {
        const existingControls = document.querySelector(`.${PREFIX}recording-fixed-controls`);
        if (existingControls) {
            existingControls.remove();
        }

        const fixedControls = document.createElement('div');
        fixedControls.className = `${PREFIX}recording-fixed-controls`;

        const buttonGroup = document.createElement('div');
        buttonGroup.className = `${PREFIX}recording-button-group`;

        const startButton = document.createElement('button');
        startButton.id = `${PREFIX}fixed-start-recording`;
        startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
        startButton.textContent = isRecording ? t('stopRecording') : t('startRecording');

        const pauseButton = document.createElement('button');
        pauseButton.id = `${PREFIX}fixed-pause-recording`;
        pauseButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        pauseButton.textContent = isPaused ? t('continueRecording') : t('pauseRecording');
        pauseButton.style.display = isRecording ? 'block' : 'none';

        const status = document.createElement('div');
        status.className = `${PREFIX}recording-status`;

        const indicator = document.createElement('div');
        indicator.className = `${PREFIX}recording-indicator-dot`;
        indicator.style.display = isRecording ? 'block' : 'none';

        const statusText = document.createElement('span');
        statusText.id = `${PREFIX}recording-status-text`;
        statusText.textContent = isRecording ? t('webAPI') : '';

        status.appendChild(indicator);
        status.appendChild(statusText);

        buttonGroup.appendChild(startButton);

        fixedControls.appendChild(buttonGroup);
        fixedControls.appendChild(status);

        document.body.appendChild(fixedControls);

        startButton.onclick = function () {
            const mainStartButton = document.getElementById(`${PREFIX}start-recording`);
            if (mainStartButton) {
                mainStartButton.click();
            } else {
                createSpeechModal();
                setTimeout(() => {
                    const newMainStartButton = document.getElementById(`${PREFIX}start-recording`);
                    if (newMainStartButton) {
                        newMainStartButton.click();
                    }
                }, 100);
            }

            updateFixedControlsState();
        };

        pauseButton.onclick = function () {
            const mainPauseButton = document.getElementById(`${PREFIX}pause-recording`);
            if (mainPauseButton) {
                mainPauseButton.click();
            }

            updateFixedControlsState();
        };

        return fixedControls;
    }

    // Обновление состояния фиксированных кнопок
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
            pauseButton.style.display = isRecording ? 'inline-block' : 'none';
        }

        if (indicator) {
            indicator.style.display = isRecording ? 'block' : 'none';
        }

        if (statusText) {
            statusText.textContent = isRecording ? t('webAPI') : '';
        }
    }

    // Создание модального окна
    function createSpeechModal() {
        currentUILang = settings.language;

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

        if (isRecording) {
            stopRecording();
        }

        applyFontSettings();

        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;

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
            if (isRecording) {
                stopRecording();
            }

            saveCurrentText();

            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        header.appendChild(title);
        header.appendChild(closeButton);

        // Табы для переключения между разделами
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
        notepad.contentEditable = "true";
        notepad.dataset.recordingState = "idle";

        // Обработчик ввода для блокнота
        notepad.addEventListener('input', () => {
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

            currentTextBuffer = [];

            // Проверка на наличие команд для очистки
            const fullText = getNotepadText(notepad);
            const cleanedText = cleanTextFromCommands(fullText);

            if (cleanedText !== fullText) {
                const cleanedLines = cleanedText.split('\n');

                safeHTML(notepad, 'innerHTML', '');

                cleanedLines.forEach(line => {
                    if (line.trim()) {
                        const lineElement = document.createElement('div');
                        lineElement.className = `${PREFIX}notepad-line`;
                        lineElement.textContent = line;
                        notepad.appendChild(lineElement);
                    }
                });

                if (cleanedLines.length > 0) {
                    currentText = cleanedLines.slice(0, -1);
                    currentLine = cleanedLines[cleanedLines.length - 1] || '';
                }
            }
        });

        // Обработчик для сохранения структуры строк при нажатии Enter
        notepad.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                setTimeout(() => {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const node = range.startContainer;

                        if (node.nodeType === Node.TEXT_NODE && node.parentNode === notepad) {
                            const div = document.createElement('div');
                            div.className = `${PREFIX}notepad-line`;

                            const text = node.textContent;
                            node.parentNode.removeChild(node);

                            div.textContent = text;
                            notepad.appendChild(div);

                            range.setStart(div.firstChild || div, div.firstChild ? div.firstChild.length : 0);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains(`${PREFIX}notepad-line`)) {
                            node.className = `${PREFIX}notepad-line`;
                        }
                    }
                }, 0);
            }
        });

        setTimeout(() => applyFontSettings(), 50);

        // Кнопки для блокнота
        const notepadButtonGroup = document.createElement('div');
        notepadButtonGroup.className = `${PREFIX}button-group`;

        // Копировать и закрыть
        const copyCloseButton = document.createElement('button');
        copyCloseButton.textContent = `${t('copyText')} & ${t('close')}`;
        copyCloseButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        copyCloseButton.id = `${PREFIX}copy-close-button`;
        copyCloseButton.onclick = () => {
            if (isRecording) {
                stopRecording();
            }

            const textToCopy = getNotepadText(notepad);
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    saveCurrentText();

                    document.body.removeChild(overlay);
                    document.body.removeChild(modal);

                    updateFixedControlsState();
                })
                .catch(err => {
                    console.error('Ошибка при копировании текста:', err);
                    alert('Не удалось скопировать текст в буфер обмена');
                });
        };

        // Копировать текст
        const copyButton = document.createElement('button');
        copyButton.textContent = t('copyText');
        copyButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        copyButton.id = `${PREFIX}copy-button`;
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

        // Очистить блокнот
        const clearButton = document.createElement('button');
        clearButton.textContent = t('clearNotepad');
        clearButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        clearButton.id = `${PREFIX}clear-button`;
        clearButton.onclick = () => {
            safeHTML(notepad, 'innerHTML', '');
            currentText = [];
            currentLine = '';
            currentTextBuffer = [];
        };

        // Отправить в AI
        const sendToAIButton = document.createElement('button');
        sendToAIButton.textContent = t('sendToAI');
        sendToAIButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        sendToAIButton.id = `${PREFIX}send-to-ai-button`;
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

        // Содержимое таба AI обработки
        const aiContent = document.createElement('div');
        aiContent.className = `${PREFIX}tab-content`;
        aiContent.id = `${PREFIX}ai-content`;

        const aiOutput = document.createElement('div');
        aiOutput.className = `${PREFIX}ai-output ${PREFIX}notepad`;
        aiOutput.id = `${PREFIX}ai-output`;
        aiOutput.style.maxHeight = '380px';
        aiOutput.style.overflowY = 'auto';

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

        // Секция статистики GPT
        const gptSection = document.createElement('div');
        gptSection.className = `${PREFIX}billing-section`;

        const gptTitle = document.createElement('h3');
        gptTitle.textContent = t('gptTokens');

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
        geminiTitle.textContent = t('geminiTokens');

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

        // Исходящие токены Gemini
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

        // Добавляем секции статистики
        billingStats.appendChild(openaiSection);
        billingStats.appendChild(gptSection);
        billingStats.appendChild(geminiSection);

        // Кнопка сброса статистики
        const resetBillingButton = document.createElement('button');
        resetBillingButton.textContent = t('resetBilling');
        resetBillingButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        resetBillingButton.onclick = () => {
            if (confirm('Вы уверены, что хотите сбросить всю статистику использования API?')) {
                resetBillingStats();
                updateBillingDisplay();
            }
        };

        billingContent.appendChild(billingStats);
        billingContent.appendChild(resetBillingButton);

        // Обновление статистики при открытии вкладки
        billingTab.addEventListener('click', () => {
            updateBillingDisplay();
        });

        // Содержимое таба инструкций
        const instructionsContent = document.createElement('div');
        instructionsContent.className = `${PREFIX}tab-content`;
        instructionsContent.id = `${PREFIX}instructions-content`;
        safeHTML(instructionsContent, 'innerHTML', getInstructionsContent());

        // Кнопки управления внизу окна
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
        indicatorText.textContent = t('webAPI');

        recordingIndicator.appendChild(indicatorDot);
        recordingIndicator.appendChild(indicatorText);

        // Селектор языка
        const languageSelect = document.createElement('select');
        languageSelect.className = `${PREFIX}btn ${PREFIX}btn-secondary`;

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

        // Обработчик изменения языка
        languageSelect.onchange = () => {
            const newLanguage = languageSelect.value;
            settings.language = newLanguage;
            GM_setValue('language', newLanguage);
            currentUILang = newLanguage;

            // Перезагрузка модального окна
            document.body.removeChild(modal);
            document.body.removeChild(overlay);
            createSpeechModal();
        };

        // Кнопка настроек
        const settingsButton = document.createElement('button');
        settingsButton.textContent = t('settings');
        settingsButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        settingsButton.onclick = () => {
            showSettingsModal(modal);
        };

        // Кнопка закрытия
        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = t('close');
        closeModalButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;
        closeModalButton.onclick = () => {
            if (isRecording) {
                stopRecording();
            }

            saveCurrentText();

            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        // Добавляем кнопки в футер
        buttonGroup.appendChild(startButton);
        buttonGroup.appendChild(recordingIndicator);
        buttonGroup.appendChild(languageSelect);
        buttonGroup.appendChild(settingsButton);
        buttonGroup.appendChild(closeModalButton);

        // Обработка переключения табов
        const tabs = [notepadTab, savedTab, aiTab, instructionsTab, billingTab];
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove(`${PREFIX}active`));
                tab.classList.add(`${PREFIX}active`);

                document.querySelectorAll(`.${PREFIX}tab-content`).forEach(tc => {
                    tc.classList.remove(`${PREFIX}active`);
                });

                document.getElementById(tab.dataset.target).classList.add(`${PREFIX}active`);
            });
        });

        // Собираем модальное окно
        modal.appendChild(header);
        modal.appendChild(tabContainer);

        modal.appendChild(notepadContent);
        modal.appendChild(savedContent);
        modal.appendChild(aiContent);
        modal.appendChild(instructionsContent);
        modal.appendChild(billingContent);

        modal.appendChild(buttonGroup);

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        // Создаем фиксированные кнопки записи
        createFixedRecordingControls();

        // Настраиваем распознавание речи
        setupSpeechRecognition(startButton, notepad, recordingIndicator, indicatorText);

        return modal;
    }

    // Функция для получения содержимого инструкций
    function getInstructionsContent() {
        const lang = settings.language;
        const activationWord = settings.activationWord;

        const instructions = {
            'ru-RU': `
            <div class="${PREFIX}instructions">
                <h3>Как использовать голосовые команды</h3>
                <p>Для активации голосовой команды произнесите активационное слово: <strong>${activationWord}</strong>, затем название команды.</p>
                
                <h4>Пример использования:</h4>
                <p><em>"${activationWord}, поставь точку"</em> - добавит точку в конце текущего предложения.</p>
                
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
                <p><em>"${activationWord}, запомни это важно для анализа"</em> запишет в блокнот: <code>{запомни это важно для анализа}</code></p>
                <p>Текст в фигурных скобках может служить инструкцией для AI при обработке.</p>
            </div>
        `,
            'en-US': `
            <div class="${PREFIX}instructions">
                <h3>How to Use Voice Commands</h3>
                <p>To activate a voice command, say the activation word: <strong>${activationWord}</strong>, followed by the command name.</p>
                
                <h4>Usage example:</h4>
                <p><em>"${activationWord}, period"</em> - will add a period at the end of the current sentence.</p>
                
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
                <p><em>"${activationWord}, remember this is important for analysis"</em> will write to the notepad: <code>{remember this is important for analysis}</code></p>
                <p>Text in curly braces can serve as an instruction for AI when processing.</p>
            </div>
        `,
            'uk-UA': `
        <div class="${PREFIX}instructions">
            <h3>Як використовувати голосові команди</h3>
            <p>Для активації голосової команди промовте активаційне слово: <strong>${activationWord}</strong>, потім назву команди.</p>
            
            <h4>Приклад використання:</h4>
            <p><em>"${activationWord}, постав крапку"</em> - додасть крапку в кінці поточного речення.</p>
            
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
            <p><em>"${activationWord}, запам'ятай це важливо для аналізу"</em> запише в блокнот: <code>{запам'ятай це важливо для аналізу}</code></p>
            <p>Текст у фігурних дужках може служити інструкцією для AI при обробці.</p>
        </div>
    `,
            'cs-CZ': `
        <div class="${PREFIX}instructions">
            <h3>Jak používat hlasové příkazy</h3>
            <p>Pro aktivaci hlasového příkazu řekněte aktivační slovo: <strong>${activationWord}</strong>, následováno názvem příkazu.</p>
            
            <h4>Příklad použití:</h4>
            <p><em>"${activationWord}, tečka"</em> - přidá tečku na konec aktuální věty.</p>
            
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
            <p><em>"${activationWord}, zapamatuj si to je důležité pro analýzu"</em> zapíše do bloku: <code>{zapamatuj si to je důležité pro analýzu}</code></p>
            <p>Text ve složených závorkách může sloužit jako instrukce pro AI při zpracování.</p>
        </div>
    `
        };

        return instructions[lang] || instructions['ru-RU'];
    }

    // Создание модального окна настроек
    function showSettingsModal(parentModal) {
        const existingModal = document.querySelector(`.${PREFIX}settings-modal`);
        const existingOverlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
        if (existingModal) document.body.removeChild(existingModal);
        if (existingOverlay) document.body.removeChild(existingOverlay);

        if (!parentModal) {
            const overlay = document.createElement('div');
            overlay.className = `${PREFIX}overlay`;
            document.body.appendChild(overlay);
        }

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
            document.body.removeChild(modal);
            if (!parentModal) {
                const overlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
                if (overlay) document.body.removeChild(overlay);
            }
        };

        header.appendChild(title);
        header.appendChild(closeButton);

        // Контейнер для контента со скроллом
        const contentContainer = document.createElement('div');
        contentContainer.className = `${PREFIX}settings-modal-content`;

        // Форма настроек
        const form = document.createElement('div');

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

        // Язык и слово активации
        const languageGroup = document.createElement('div');
        languageGroup.className = `${PREFIX}form-group`;

        const languageLabel = document.createElement('label');
        languageLabel.textContent = t('language');
        languageLabel.htmlFor = `${PREFIX}language`;

        const languageSelect = document.createElement('select');
        languageSelect.id = `${PREFIX}language`;

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

        // Слово активации
        const activationWordGroup = document.createElement('div');
        activationWordGroup.className = `${PREFIX}form-group`;

        const activationWordLabel = document.createElement('label');
        activationWordLabel.textContent = t('activationWord');
        activationWordLabel.htmlFor = `${PREFIX}activation-word`;

        const activationWordInput = document.createElement('input');
        activationWordInput.type = 'text';
        activationWordInput.id = `${PREFIX}activation-word`;
        activationWordInput.value = settings.activationWord;

        activationWordGroup.appendChild(activationWordLabel);
        activationWordGroup.appendChild(activationWordInput);

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
        darkModeLabel.textContent = t('darkMode');
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

            const modal = document.querySelector(`.${PREFIX}speech-modal`);
            if (modal) {
                if (isDarkMode) {
                    modal.classList.add('dark-mode');
                } else {
                    modal.classList.remove('dark-mode');
                }
            }
        };

        form.appendChild(darkModeGroup);

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

        // Контейнер для кнопок экспорта/импорта
        const exportImportGroup = document.createElement('div');
        exportImportGroup.style.marginTop = '20px';
        exportImportGroup.style.display = 'flex';
        exportImportGroup.style.gap = '10px';

        // Кнопка экспорта настроек
        const exportButton = document.createElement('button');
        exportButton.textContent = t('exportSettings');
        exportButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        exportButton.onclick = exportSettings;

        // Кнопка импорта настроек
        const importButton = document.createElement('button');
        importButton.textContent = t('importSettings');
        importButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        importButton.onclick = importSettings;

        exportImportGroup.appendChild(exportButton);
        exportImportGroup.appendChild(importButton);

        form.appendChild(exportImportGroup);

        // Собираем форму
        form.appendChild(openaiApiGroup);
        form.appendChild(languageGroup);
        form.appendChild(activationWordGroup);
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
            settings.openaiApiKey = openaiApiInput.value;
            settings.language = languageSelect.value;
            settings.activationWord = activationWordInput.value;
            settings.siteList = sitesInput.value;
            settings.ttsVoice = ttsVoiceSelect.value;
            settings.ttsModel = ttsModelSelect.value;
            settings.fontFamily = fontFamilySelect.value;
            settings.fontSize = fontSizeInput.value;
            settings.fontWeight = fontWeightSelect.value;
            settings.lineHeight = lineHeightInput.value;

            // Сохраняем настройки
            GM_setValue('openaiApiKey', settings.openaiApiKey);
            GM_setValue('language', settings.language);
            GM_setValue('activationWord', settings.activationWord);
            GM_setValue('siteList', settings.siteList);
            GM_setValue('ttsVoice', settings.ttsVoice);
            GM_setValue('ttsModel', settings.ttsModel);
            GM_setValue('fontFamily', settings.fontFamily);
            GM_setValue('fontSize', settings.fontSize);
            GM_setValue('fontWeight', settings.fontWeight);
            GM_setValue('lineHeight', settings.lineHeight);
            GM_setValue('darkMode', darkModeToggle.checked);

            alert(t('settingsSaved'));

            if (!parentModal) {
                const overlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
                if (overlay) document.body.removeChild(overlay);
            }
            document.body.removeChild(modal);

            // Обновляем настройки в родительском окне
            if (parentModal) {
                currentUILang = settings.language;

                const notepad = document.getElementById(`${PREFIX}notepad`);
                if (notepad) {
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

        // Центрирование относительно родительского окна
        if (parentModal) {
            const parentRect = parentModal.getBoundingClientRect();
            modal.style.top = `${parentRect.top + 100}px`;
        }
    }

    // Модальное окно настроек AI
    function showAISettingsModal(parentModal) {
        const existingModal = document.querySelector(`.${PREFIX}ai-settings-modal`);
        const existingOverlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
        if (existingModal) document.body.removeChild(existingModal);
        if (existingOverlay) document.body.removeChild(existingOverlay);

        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;
        document.body.appendChild(overlay);

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

        // Контейнер для контента со скроллом
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

        // Разделы настроек
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

        const commonSection = document.createElement('div');
        commonSection.className = `${PREFIX}settings-section`;

        const commonHeader = document.createElement('h3');
        commonHeader.textContent = t('commonSettings');
        commonHeader.style.marginTop = '20px';
        commonHeader.style.marginBottom = '10px';

        commonSection.appendChild(commonHeader);

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

        form.appendChild(geminiSection);
        form.appendChild(gptSection);
        form.appendChild(commonSection);

        contentContainer.appendChild(form);

        // Кнопки для сохранения настроек
        const footerContainer = document.createElement('div');
        footerContainer.className = `${PREFIX}settings-modal-footer`;

        const buttonGroup = document.createElement('div');
        buttonGroup.className = `${PREFIX}button-group`;

        const saveButton = document.createElement('button');
        saveButton.textContent = t('save');
        saveButton.className = `${PREFIX}btn ${PREFIX}btn-primary`;
        saveButton.onclick = () => {
            // Сохраняем настройки AI
            settings.defaultAIProvider = geminiRadio.checked ? 'gemini' : 'gpt';
            settings.geminiApiKey = geminiKeyInput.value;
            settings.geminiApiUrl = geminiUrlInput.value;
            settings.geminiModel = geminiModelInput.value;
            settings.gptApiKey = gptKeyInput.value;
            settings.gptApiUrl = gptUrlInput.value;
            settings.gptModel = gptModelInput.value;
            settings.temperature = temperatureInput.value;
            settings.maxTokens = maxTokensInput.value;
            settings.systemPrompt = systemPromptInput.value;
            settings.mainPrompt = mainPromptInput.value;
            settings.historyCount = historyCountInput.value;

            // Сохраняем в хранилище
            GM_setValue('defaultAIProvider', settings.defaultAIProvider);
            GM_setValue('geminiApiKey', settings.geminiApiKey);
            GM_setValue('geminiApiUrl', settings.geminiApiUrl);
            GM_setValue('geminiModel', settings.geminiModel);
            GM_setValue('gptApiKey', settings.gptApiKey);
            GM_setValue('gptApiUrl', settings.gptApiUrl);
            GM_setValue('gptModel', settings.gptModel);
            GM_setValue('temperature', settings.temperature);
            GM_setValue('maxTokens', settings.maxTokens);
            GM_setValue('systemPrompt', settings.systemPrompt);
            GM_setValue('mainPrompt', settings.mainPrompt);
            GM_setValue('historyCount', settings.historyCount);

            alert(t('aiSettingsSaved'));
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

        buttonGroup.appendChild(saveButton);
        buttonGroup.appendChild(cancelButton);
        footerContainer.appendChild(buttonGroup);

        modal.appendChild(header);
        modal.appendChild(contentContainer);
        modal.appendChild(footerContainer);

        document.body.appendChild(modal);

        modal.style.zIndex = '2147483648';
    }

    // Модальное окно пользовательских команд
    function showCustomCommandsModal(parentModal) {
        const customCommands = GM_getValue('customVoiceCommands', {});

        const existingModal = document.querySelector(`.${PREFIX}custom-commands-modal`);
        const existingOverlay = document.querySelector(`.${PREFIX}overlay:not(:first-child)`);
        if (existingModal) document.body.removeChild(existingModal);
        if (existingOverlay) document.body.removeChild(existingOverlay);

        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;
        document.body.appendChild(overlay);

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

        // Контейнер для контента со скроллом
        const contentContainer = document.createElement('div');
        contentContainer.className = `${PREFIX}settings-modal-content`;

        // Таблица команд
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

        // Кнопки управления
        const footerContainer = document.createElement('div');
        footerContainer.className = `${PREFIX}settings-modal-footer`;

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

    // Модальное окно добавления новой команды
    function showAddCommandModal(tableBody) {
        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}overlay`;
        overlay.style.zIndex = '2147483649';
        document.body.appendChild(overlay);

        const modal = document.createElement('div');
        modal.className = `${PREFIX}settings-modal`;
        modal.style.zIndex = '2147483650';
        modal.style.width = '400px';

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
            },
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

            const row = createCommandRow(lang, command, action, tableBody);
            tableBody.appendChild(row);

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

        form.appendChild(langGroup);
        form.appendChild(commandGroup);
        form.appendChild(actionGroup);
        form.appendChild(buttonsGroup);

        modal.appendChild(header);
        modal.appendChild(form);

        document.body.appendChild(modal);
    }

    // Сохранение пользовательских команд
    function saveCustomCommands() {
        const tableBody = document.getElementById(`${PREFIX}custom-commands-tbody`);
        if (!tableBody) return;

        const customCommands = {};

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

        GM_setValue('customVoiceCommands', customCommands);
        updateVoiceCommands();
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

    // Экспорт настроек
    function exportSettings() {
        const exportData = {
            settings: {
                openaiApiKey: settings.openaiApiKey,
                language: settings.language,
                activationWord: settings.activationWord,
                siteList: settings.siteList,
                ttsVoice: settings.ttsVoice,
                ttsModel: settings.ttsModel,
                fontSize: settings.fontSize,
                fontFamily: settings.fontFamily,
                fontWeight: settings.fontWeight,
                lineHeight: settings.lineHeight,
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

    // Импорт настроек
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

                    if (!importData.settings) {
                        throw new Error(t('invalidSettingsFile'));
                    }

                    Object.assign(settings, importData.settings);

                    for (const [key, value] of Object.entries(importData.settings)) {
                        GM_setValue(key, value);
                    }

                    if (importData.savedTexts) {
                        savedTexts = importData.savedTexts;
                        GM_setValue('savedTexts', savedTexts);
                    }

                    if (importData.billing) {
                        Object.assign(billing, importData.billing);

                        for (const [provider, stats] of Object.entries(importData.billing)) {
                            for (const [key, value] of Object.entries(stats)) {
                                GM_setValue(`${provider}_${key}`, value);
                            }
                        }
                    }

                    if (importData.customCommands) {
                        GM_setValue('customVoiceCommands', importData.customCommands);
                        updateVoiceCommands();
                    }

                    alert(t('settingsImported'));

                    applyFontSettings();
                    currentUILang = settings.language;
                    updateBillingDisplay();
                } catch (error) {
                    console.error('Ошибка импорта настроек:', error);
                    alert(`${t('processingError')} ${error.message}`);
                }
            };

            reader.readAsText(file);
        };

        input.click();
    }

    // Обработка текста через AI
    function processTextWithAI() {
        const notepadText = getNotepadText(document.getElementById(`${PREFIX}notepad`));
        if (!notepadText.trim()) {
            alert(t('noTextToProcess'));
            return;
        }

        if (settings.defaultAIProvider === 'gemini') {
            processWithGemini(notepadText);
            return;
        } else if (settings.defaultAIProvider === 'gpt') {
            processWithGPT(notepadText);
            return;
        }

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

    // Обработка через GPT
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

        console.log("GPT API URL:", settings.gptApiUrl);

        // Формируем запрос в соответствии с документацией OpenAI API
        const requestData = {
            model: settings.gptModel || "gpt-3.5-turbo",
            messages: [{
                    role: "system",
                    content: settings.systemPrompt
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: parseFloat(settings.temperature),
            max_tokens: parseInt(settings.maxTokens)
        };

        console.log("Отправляемые данные в GPT:", JSON.stringify(requestData));

        // Отправляем запрос к API
        GM_xmlhttpRequest({
            method: 'POST',
            url: settings.gptApiUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.gptApiKey}`
            },
            data: JSON.stringify(requestData),
            onload: response => {
                hideLoading();

                console.log("GPT ответ статус:", response.status);
                console.log("GPT ответ текст:", response.responseText);

                try {
                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(`API ответил с кодом ${response.status}: ${response.responseText}`);
                    }

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
                        throw new Error('Нет ответов в ответе API');
                    }
                } catch (error) {
                    console.error('Ошибка обработки ответа GPT:', error);
                    console.error('Исходный ответ:', response.responseText);
                    alert(format(t('processingError'), error.message));
                }
            },
            onerror: error => {
                hideLoading();
                console.error('Ошибка запроса к GPT API:', error);
                alert(format(t('processingError'), error.statusText || 'Ошибка сети'));
            }
        });
    }

    // Функция для получения истории сообщений
    function getHistoryMessages(currentText) {
        const messages = [];
        const historyCount = parseInt(settings.historyCount) || 0;

        if (historyCount > 0 && savedTexts.length > 0) {
            const recentTexts = savedTexts.slice(-historyCount);
            recentTexts.forEach(item => {
                messages.push(`[${item.date}] ${item.text}`);
            });
        }

        messages.push(`CURRENT_TEXT: ${currentText}`);

        return messages;
    }

    // Показать индикатор загрузки
    function showLoading() {
        const aiOutput = document.getElementById(`${PREFIX}ai-output`);
        if (aiOutput) {
            safeHTML(aiOutput, 'innerHTML', `<div style="text-align: center; padding: 20px; color: #666;">${t('processing')}</div>`);
        }

        document.querySelector(`[data-target="${PREFIX}ai-content"]`).click();
    }

    // Скрыть индикатор загрузки
    function hideLoading() {
        const aiOutput = document.getElementById(`${PREFIX}ai-output`);
        if (aiOutput && aiOutput.innerHTML.includes(t('processing'))) {
            safeHTML(aiOutput, 'innerHTML', '');
        }
    }

    // Отображение результата AI
    function displayAIResult(result) {
        const aiOutput = document.getElementById(`${PREFIX}ai-output`);
        if (aiOutput) {
            safeHTML(aiOutput, 'innerHTML', '');

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

    // ========================
    // РАСПОЗНАВАНИЕ РЕЧИ
    // ========================

    // Настройка распознавания речи
    function setupSpeechRecognition(startButton, notepad, recordingIndicator, indicatorText) {

        // Очистка переменных
        currentText = [];
        currentLine = '';
        currentTextBuffer = [];

        // Очистка блокнота
        safeHTML(notepad, 'innerHTML', '');

        // Кнопка паузы/продолжения
        const pauseButton = document.createElement('button');
        pauseButton.textContent = t('pauseRecording');
        pauseButton.className = `${PREFIX}btn ${PREFIX}btn-secondary`;
        pauseButton.style.display = 'none';
        pauseButton.id = `${PREFIX}pause-recording`;

        startButton.parentNode.insertBefore(pauseButton, startButton.nextSibling);

        window.togglePause = function () {
            if (isPaused) {
                // Возобновляем запись
                isPaused = false;

                if (window.recognition) {
                    try {
                        window.recognition.start();
                    } catch (e) {
                        console.warn('Ошибка при запуске recognition после паузы:', e);
                    }
                }

                if (currentLine.trim() !== '') {
                    currentLine += ' ';
                }

                pauseButton.textContent = t('pauseRecording');

                indicatorText.parentNode.style.opacity = '1';

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
                }

                pauseButton.textContent = t('continueRecording');

                indicatorText.parentNode.style.opacity = '0.5';

                const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
                if (volumeMeter) {
                    volumeMeter.style.display = 'none';
                }
                updateFixedControlsState();
            }
        };

        pauseButton.onclick = window.togglePause;

        // Настраиваем обработчик клавиши пробел для управления паузой
        setupSpaceKeyHandler();

        // Настройка Web Speech API
        function setupBrowserSpeechAPI() {
            // Добавляем дополнительные классы CSS для динамических элементов
            addHighlightStyles();

            window.recognition = new webkitSpeechRecognition();
            window.recognition.continuous = true;
            window.recognition.interimResults = true;
            window.recognition.lang = settings.language;

            createVolumeMeter();
            const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);

            // Новая функция для обработки команд
            function handleCommand(text) {
                const activationWord = settings.activationWord.toLowerCase();
                const lowerText = text.toLowerCase();
                const activationIndex = lowerText.indexOf(activationWord);

                if (activationIndex === -1) {
                    return {
                        isCommand: false
                    };
                }

                // Получаем часть текста до активационного слова
                const beforeActivation = text.substring(0, activationIndex).trim();

                // Получаем весь текст после активационного слова
                const afterActivationStart = activationIndex + activationWord.length;
                const afterActivationFullText = text.substring(afterActivationStart).trim();
                const afterActivation = lowerText.substring(afterActivationStart).trim();

                if (!afterActivation) {
                    // Только активационное слово без команды
                    return {
                        isCommand: true,
                        processedText: beforeActivation // Возвращаем только текст до активационного слова
                    };
                }

                // Получаем команды для текущего языка
                const lang = settings.language;
                const commands = VOICE_COMMANDS[lang] || VOICE_COMMANDS['ru-RU'];
                const customCommands = GM_getValue('customVoiceCommands', {});
                const langCommands = customCommands[lang] ? {
                    ...commands,
                    ...customCommands[lang]
                } : commands;

                // Ищем команду в тексте после активационного слова
                for (const [cmd, action] of Object.entries(langCommands)) {
                    if (afterActivation.includes(cmd)) {
                        // Вырезаем активационное слово и команду из текста
                        // Находим начало и конец команды в оригинальном тексте, сохраняя регистр
                        const cmdLower = cmd.toLowerCase();
                        const cmdIndex = afterActivation.indexOf(cmdLower);

                        // Определяем, есть ли после команды знак пунктуации, который нужно удалить
                        let hasPunctuation = false;
                        let punctuationToRemove = '';

                        if (['period', 'comma', 'questionMark', 'exclamationMark', 'colon'].includes(action)) {
                            // Проверяем, есть ли в оригинальном тексте после команды соответствующий знак пунктуации
                            const punctuation = {
                                'period': '.',
                                'comma': ',',
                                'questionMark': '?',
                                'exclamationMark': '!',
                                'colon': ':'
                            } [action];

                            // Ищем этот знак после команды
                            const afterCommand = afterActivationFullText.substring(cmdIndex + cmd.length);
                            if (afterCommand.trim().startsWith(punctuation)) {
                                hasPunctuation = true;
                                punctuationToRemove = punctuation;
                            }
                        }

                        // Нашли команду - выполняем её
                        executeVoiceCommand(action);
                        showCommandIndicator(cmd);

                        // Для команд пунктуации
                        if (['period', 'comma', 'questionMark', 'exclamationMark', 'colon'].includes(action)) {
                            const punctuation = {
                                'period': '.',
                                'comma': ',',
                                'questionMark': '?',
                                'exclamationMark': '!',
                                'colon': ':'
                            } [action];

                            // Если уже есть знак пунктуации после команды, не добавляем повторно
                            if (hasPunctuation) {
                                return {
                                    isCommand: true,
                                    processedText: beforeActivation
                                };
                            }

                            // Возвращаем текст до активационного слова + знак пунктуации
                            return {
                                isCommand: true,
                                processedText: beforeActivation ? beforeActivation + punctuation : punctuation
                            };
                        }

                        // Для остальных команд просто возвращаем текст до активационного слова
                        return {
                            isCommand: true,
                            processedText: beforeActivation
                        };
                    }
                }

                // Активационное слово есть, но команда не распознана
                return {
                    isCommand: true,
                    processedText: beforeActivation ? beforeActivation + ` {${afterActivation}}` : `{${afterActivation}}`
                };
            }

            // Основной обработчик результатов распознавания
            window.recognition.onresult = (event) => {
                if (isPaused) return;

                if (volumeMeter) volumeMeter.style.display = 'block';

                let isFinal = false;
                let fullTranscript = '';

                // Собираем полный текст из результата
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    fullTranscript += transcript + ' ';
                    isFinal = event.results[i].isFinal;
                }

                // Если это финальный результат - проверяем на наличие команд
                if (isFinal) {

                    const activationWord = settings.activationWord.toLowerCase();

                    // Разбиваем текст на части до и после активационного слова
                    if (fullTranscript.toLowerCase().includes(activationWord)) {
                        const parts = fullTranscript.split(new RegExp(activationWord, 'i'));

                        // Обрабатываем только последнюю команду, если их несколько
                        let textBeforeCommand = parts.slice(0, -1).join(activationWord);
                        let commandPart = parts[parts.length - 1];

                        // Проверяем, содержит ли команда что-то после активационного слова
                        if (commandPart && commandPart.trim()) {
                            let commandProcessed = false;

                            // Проверяем все доступные команды
                            const lang = settings.language;
                            const commands = VOICE_COMMANDS[lang] || VOICE_COMMANDS['ru-RU'];
                            const customCommands = GM_getValue('customVoiceCommands', {});
                            const langCommands = customCommands[lang] ? {
                                ...commands,
                                ...customCommands[lang]
                            } : commands;

                            for (const [cmd, action] of Object.entries(langCommands)) {
                                if (commandPart.toLowerCase().includes(cmd.toLowerCase())) {
                                    // Команда найдена - удаляем её и активационное слово из текста
                                    commandProcessed = true;

                                    // Выполняем команду
                                    executeVoiceCommand(action);
                                    showCommandIndicator(cmd);

                                    // Особая обработка для знаков пунктуации
                                    if (['period', 'comma', 'questionMark', 'exclamationMark', 'colon'].includes(action)) {
                                        const punctuation = {
                                            'period': '.',
                                            'comma': ',',
                                            'questionMark': '?',
                                            'exclamationMark': '!',
                                            'colon': ':'
                                        } [action];

                                        // Добавляем знак пунктуации к тексту до команды, 
                                        // удаляя уже существующий такой же знак, если он есть
                                        const lastChar = textBeforeCommand.trim().slice(-1);
                                        if (lastChar === punctuation) {
                                            // Знак уже есть - не добавляем повторно
                                            updateNotepadWithCleanText(textBeforeCommand.trim(), true);
                                        } else {
                                            // Добавляем знак пунктуации
                                            updateNotepadWithCleanText(textBeforeCommand.trim() + punctuation, true);
                                        }
                                    } else {
                                        // Для других команд просто обновляем текст, удалив команду
                                        updateNotepadWithCleanText(textBeforeCommand.trim(), true);
                                    }

                                    break;
                                }
                            }

                            // Если команда не распознана, но есть активационное слово
                            if (!commandProcessed) {
                                // Это специальная инструкция для AI
                                // Заключаем текст после активационного слова в фигурные скобки
                                updateNotepadWithCleanText(textBeforeCommand.trim() + ` [${commandPart.trim()}]`, true);
                            }
                        } else {
                            // Только активационное слово без команды
                            updateNotepadWithCleanText(textBeforeCommand.trim(), true);
                        }
                    } else {
                        // Нет активационного слова - просто обновляем блокнот
                        updateNotepadWithCleanText(fullTranscript.trim(), false);
                    }
                } else {
                    // Это промежуточный результат - просто показываем его в блокноте
                    // без обработки команд
                    updateNotepadLine(fullTranscript.trim());
                }
            };

            // Индикатор активности для Web API - без изменений
            let blinkInterval = null;

            window.recognition.onstart = () => {
                if (volumeMeter) volumeMeter.style.display = 'block';

                if (blinkInterval) clearInterval(blinkInterval);
                let level = 0;
                const volumeLevel = volumeMeter.querySelector(`.${PREFIX}volume-level`);

                blinkInterval = setInterval(() => {
                    if (!isRecording || isPaused) {
                        clearInterval(blinkInterval);
                        if (volumeMeter) volumeMeter.style.display = 'none';
                        return;
                    }

                    level = Math.random() * 60 + 10; // 10-70%
                    if (volumeLevel) volumeLevel.style.height = `${level}%`;
                }, 300);
            };

            window.recognition.onend = () => {
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

        function updateNotepadLine(text) {
            currentLine = text;
            let updateNotepadLineText = ''
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
                    updateNotepadLineText += ' ' + text;
                } else {
                    updateNotepadLineText = text;
                }
                updateIntermediateResult(updateNotepadLineText)
            }


        }

        // Функция для обновления блокнота с очищенным текстом
        function updateNotepadWithCleanText(text, isCmd) {
            if (isCmd) {
                // Удаляем дублирующиеся знаки препинания
                text = text.replace(/\.{2,}/g, '.').replace(/,{2,}/g, ',')
                    .replace(/\?{2,}/g, '?').replace(/!{2,}/g, '!')
                    .replace(/:{2,}/g, ':');
            }

            const newWords = text.split(/\s+/).filter(w => w.trim());
            if (newWords.length > 0) {
                // Применяем капитализацию к первому слову, если флаг установлен
                if (capitalizeNextWord && newWords.length > 0) {
                    const word = newWords[0];
                    if (word && word.length > 0) {
                        newWords[0] = word.charAt(0).toUpperCase() + word.slice(1);
                    }
                    capitalizeNextWord = false; // Сбрасываем флаг после применения
                }

                currentTextBuffer = currentTextBuffer.concat(newWords);

                // Обновляем отображение
                const line = notepad.lastChild || document.createElement('div');
                if (!line.parentNode) {
                    line.className = `${PREFIX}notepad-line`;
                    notepad.appendChild(line);
                }

                if (isCmd) {
                    line.textContent = currentTextBuffer.join(' ');
                    textPunctuationCorrector(line); 
                } else {
                    // Преобразуем массив слов в строку, объединяя знаки пунктуации с предыдущими словами
                    let processedBuffer = [];
                    let skipNext = false;
                    
                    for (let i = 0; i < currentTextBuffer.length; i++) {
                        if (skipNext) {
                            skipNext = false;
                            continue;
                        }
                        
                        let current = currentTextBuffer[i];
                        
                        // Проверяем, является ли следующий элемент знаком пунктуации
                        if (i < currentTextBuffer.length - 1 && /^[.,;:!?]$/.test(currentTextBuffer[i + 1])) {
                            current += currentTextBuffer[i + 1]; // Присоединяем знак пунктуации напрямую
                            skipNext = true; // Пропускаем следующий элемент, так как уже использовали
                        }
                        
                        processedBuffer.push(current);
                    }
                    
                    // Соединяем слова с пробелами
                    line.textContent = processedBuffer.join(' ');
                    
                    // Дополнительно проверяем, не осталось ли пробелов перед знаками пунктуации
                    textPunctuationCorrector(line);
                }
            }

            notepad.scrollTop = notepad.scrollHeight;
        }

        // Функция для обновления промежуточных результатов
        function updateIntermediateResult(text) {
            if (text) {
                // Применяем капитализацию, если флаг установлен
                if (capitalizeNextWord && text.trim().length > 0) {
                    const words = text.trim().split(/\s+/);
                    if (words.length > 0) {
                        const word = words[0];
                        if (word && word.length > 0) {
                            words[0] = word.charAt(0).toUpperCase() + word.slice(1);
                            text = words.join(' ');
                            // Не сбрасываем флаг здесь, так как это промежуточный результат
                        }
                    }
                }

                // Временное отображение текущего распознавания
                const line = notepad.lastChild || document.createElement('div');
                if (!line.parentNode) {
                    line.className = `${PREFIX}notepad-line`;
                    notepad.appendChild(line);
                }
                line.textContent = currentTextBuffer.join(' ') + (currentTextBuffer.length > 0 ? ' ' : '') + text;
                textPunctuationCorrector(line);
            }
        }

        function textPunctuationCorrector(line) {
            if (!line || typeof line !== 'object' || !line.textContent) {
                return;
            }
            
            // Получаем текущий текст
            let content = line.textContent;
            
            // Заменяем пробелы перед всеми знаками пунктуации (глобальный флаг g)
            content = content.replace(/\s+([.,;:!?])/g, '$1');
            
            // Обновляем текст элемента
            line.textContent = content;
        }

        // Функция для добавления стилей подсветки слов
        function addHighlightStyles() {
            const styleId = `${PREFIX}highlight-styles`;

            // Проверяем, не добавлены ли уже стили
            if (document.getElementById(styleId)) {
                return;
            }

            // Создаем стили для подсветки слов
            const styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.textContent = `
        .${PREFIX}highlight-word {
            background-color: #e8f0fe;
            transition: background-color 1s;
        }
    `;

            // Добавляем стили в head
            document.head.appendChild(styleElement);
        }

        // Обработчик клавиши пробел для управления паузой
        function setupSpaceKeyHandler() {
            // Удаляем существующий обработчик, если он есть
            document.removeEventListener('keydown', handleSpaceKey);

            // Определяем функцию-обработчик клавиши
            function handleSpaceKey(event) {
                // Проверяем, что нажата клавиша пробел и модальное окно блокнота открыто
                if (event.code === 'Space' && isRecording && document.querySelector(`.${PREFIX}speech-modal`)) {
                    // Предотвращаем действие по умолчанию (прокрутку страницы)
                    event.preventDefault();

                    // Переключаем состояние паузы
                    window.togglePause();
                }
            }

            // Добавляем новый обработчик
            document.addEventListener('keydown', handleSpaceKey);

            // Удаляем обработчик при закрытии страницы
            window.addEventListener('beforeunload', () => {
                document.removeEventListener('keydown', handleSpaceKey);
            });
        }

        // Создание индикатора громкости
        function createVolumeMeter() {
            const oldMeter = document.querySelector(`.${PREFIX}volume-meter`);
            if (oldMeter && oldMeter.parentNode) {
                oldMeter.parentNode.removeChild(oldMeter);
            }

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
            volumeMeter.style.display = 'none';

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

            return volumeMeter;
        }

        // Обработчик для кнопки старт/стоп
        startButton.onclick = () => {
            if (!isRecording) {
                // Начинаем запись
                isRecording = true;
                isPaused = false;
                notepad.dataset.recordingState = "recording";
                pauseButton.style.display = 'inline-block';

                startButton.textContent = t('stopRecording');
                startButton.className = `${PREFIX}btn ${PREFIX}btn-danger`;

                recordingIndicator.style.display = 'inline-flex';
                recordingIndicator.style.opacity = '1';

                // Используем только браузерное API
                indicatorText.textContent = t('webAPI');
                setupBrowserSpeechAPI();
                window.recognition.start();
            } else {
                // Останавливаем запись
                stopRecording();

                pauseButton.style.display = 'none';

                startButton.textContent = t('startRecording');
                startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;

                recordingIndicator.style.display = 'none';
                notepad.dataset.recordingState = "idle";
            }
            updateFixedControlsState();
        };

        // Инициализация распознавания
        if ('webkitSpeechRecognition' in window) {
            setupBrowserSpeechAPI();
        } else {
            alert(t('errorAudioInit'));
            return;
        }

        startButton.className = `${PREFIX}btn ${PREFIX}btn-success`;
        pauseButton.style.display = 'none';
        indicatorText.textContent = t('webAPI');

        processedCommands = [];
    }

    // Остановка записи и освобождение ресурсов
    function stopRecording() {
        if (!isRecording) return;

        isRecording = false;
        isPaused = false;

        const notepad = document.getElementById(`${PREFIX}notepad`);
        if (notepad) {
            notepad.dataset.recordingState = "idle"; // Вернуть состояние покоя при остановке записи
        }

        if (window.recognition) {
            try {
                window.recognition.stop();
            } catch (e) {
                console.warn('Ошибка при остановке recognition:', e);
            }
        }

        if (window.speechStream) {
            window.speechStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
        }

        window.speechStream = null;
        window.recognition = null;

        if (currentLine.trim() !== '') {
            currentText.push(currentLine);
            currentLine = '';
        }

        if (currentTextBuffer.length > 0) {
            currentText.push(currentTextBuffer.join(' '));
            currentTextBuffer = [];
        }

        if (commandCleanupTimer) {
            clearTimeout(commandCleanupTimer);
            commandCleanupTimer = null;
        }
        pendingCommandCleanup = false;
        lastProcessedText = '';
        commandActivated = false;

        const pauseButton = document.getElementById(`${PREFIX}pause-recording`);
        if (pauseButton) {
            pauseButton.style.display = 'none';
        }

        const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
        if (volumeMeter) {
            volumeMeter.style.display = 'none';
        }

        updateFixedControlsState();
        processedCommands = [];
    }

    // ========================
    // ИНИЦИАЛИЗАЦИЯ
    // ========================

    // Добавление кнопки помощника на страницу
    function addAssistantButton() {
        if (buttonAdded || document.getElementById(`${PREFIX}speech-assistant-button`)) {
            return;
        }
        const assistantButton = document.createElement('button');
        assistantButton.id = `${PREFIX}speech-assistant-button`;
        assistantButton.textContent = '🎤';
        assistantButton.title = 'Голосовой помощник (Ctrl+Shift+S)';

        assistantButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            createSpeechModal();
        };

        document.body.appendChild(assistantButton);
        buttonAdded = true;
    }

    // Адаптация интерфейса для мобильных устройств
    function adaptToMobile(modal) {
        if (!isMobileDevice()) return;

        modal.style.width = '90%';
        modal.style.height = '80%';
        modal.style.maxWidth = '500px';

        const allButtons = modal.querySelectorAll(`.${PREFIX}btn`);
        allButtons.forEach(btn => {
            btn.style.padding = '10px 16px';
            btn.style.fontSize = '16px';
            btn.style.margin = '3px';
        });

        const volumeMeter = document.querySelector(`.${PREFIX}volume-meter`);
        if (volumeMeter) {
            volumeMeter.style.bottom = '120px';
            volumeMeter.style.right = '10px';
        }
    }

    // Инициализация скрипта - добавляем стили и ожидаем DOM
    function initScript() {
        addIsolatedStyles();

        // Добавляем кнопку при загрузке страницы
        addAssistantButton();

        // Отслеживаем изменения DOM для восстановления кнопки
        let observerActive = true;

        const observer = new MutationObserver((mutations) => {
            if (!observerActive || buttonAdded) return;

            observerActive = false;

            if (!document.getElementById(`${PREFIX}speech-assistant-button`)) {
                buttonAdded = false;
                addAssistantButton();
            }

            setTimeout(() => {
                observerActive = true;
            }, 100);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: false
        });

        // Добавляем горячую клавишу для открытия модального окна (Ctrl+Shift+S)
        document.addEventListener('keydown', event => {
            if (event.ctrlKey && event.shiftKey && event.key === 'S') {
                event.preventDefault();
                createSpeechModal();
            }
        });

        // Горячая клавиша для AI таба
        document.addEventListener('keydown', event => {
            if (event.ctrlKey && event.key === 'a' && document.querySelector(`.${PREFIX}speech-modal`)) {
                event.preventDefault();
                document.querySelector(`[data-target="${PREFIX}ai-content"]`).click();
            }
        });

        // Восстанавливаем кнопку через некоторое время
        setTimeout(() => {
            if (!document.getElementById(`${PREFIX}speech-assistant-button`)) {
                buttonAdded = false;
                addAssistantButton();
            }
        }, 2000);
    }

    // Запускаем скрипт
    initScript();
})();