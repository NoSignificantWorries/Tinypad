/**
 * file-io.js
 * Логика для Save, Save As, Open File в Drawing Tools
 * Требует window.appState для сериализации/десериализации
 */

(function() {
    // Сохраняем последнее имя файла и handle (если поддерживается)
    let lastFileName = "drawing.json";
    let fileHandle = null;

    // Получить данные для сохранения (можно заменить на нужный объект)
    function getDataToSave() {
        // Здесь можно сериализовать только нужные части appState
        return JSON.stringify({ objects: window.appState.objects }, null, 2);
    }

    // Загрузить данные в приложение
    function loadDataFromJson(json) {
        try {
            const data = JSON.parse(json);
            window.appState.objects.length = 0;
            if (Array.isArray(data.objects)) {
                window.appState.objects.push(...data.objects);
            }
            if (window.redraw) window.redraw();
            alert("Файл успешно загружен!");
        } catch (e) {
            alert("Ошибка загрузки файла: " + e.message);
        }    
    }

    // Сохранить файл через обычное скачивание
    function saveFileDownload(filename, data) {
        const blob = new Blob([data], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    // Сохранить файл через File System Access API (если поддерживается)
    async function saveFileWithHandle(data) {
        if (!fileHandle) {
            await saveFileAs();
            return;
        }
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
    }

    // "Сохранить" — если есть handle, то туда, иначе просто скачать
    async function saveFile() {
        const data = getDataToSave();
        if (window.showSaveFilePicker) {
            if (fileHandle) {
                await saveFileWithHandle(data);
            } else {
                await saveFileAs();
            }
        } else {
            saveFileDownload(lastFileName, data);
        }
    }

    // "Сохранить как" — всегда спрашиваем место
    async function saveFileAs() {
        const data = getDataToSave();
        if (window.showSaveFilePicker) {
            try {
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: lastFileName,
                    types: [{
                        description: "Drawing JSON",
                        accept: {"application/json": [".json"]}
                    }]
                });
                lastFileName = fileHandle.name || lastFileName;
                await saveFileWithHandle(data);
            } catch (e) {
                // Пользователь отменил
            }
        } else {
            // Fallback: обычное скачивание
            const name = prompt("Введите имя файла", lastFileName) || lastFileName;
            saveFileDownload(name, data);
        }
    }

    // "Открыть файл" — диалог выбора, читаем JSON
    async function openFile() {
        if (window.showOpenFilePicker) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: "Drawing JSON",
                        accept: {"application/json": [".json"]}
                    }]
                });
                fileHandle = handle;
                lastFileName = handle.name || lastFileName;
                const file = await handle.getFile();
                const text = await file.text();
                loadDataFromJson(text);
            } catch (e) {
                // Пользователь отменил
            }
        } else {
            // Fallback: input[type=file]
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                lastFileName = file.name;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    loadDataFromJson(ev.target.result);
                };
                reader.readAsText(file);
            };
            input.click();
        }
    }

    // Навешиваем обработчики на пункты меню
    document.addEventListener("DOMContentLoaded", function() {
        const saveBtn = document.querySelector('[data-i18n="save"]');
        const saveAsBtn = document.querySelector('[data-i18n="saveAs"]');
        const openBtn = document.querySelector('[data-i18n="openFile"]');
        if (saveBtn) saveBtn.addEventListener("click", async function(e) {
            e.stopPropagation();
            await saveFile();
        });
        if (saveAsBtn) saveAsBtn.addEventListener("click", async function(e) {
            e.stopPropagation();
            await saveFileAs();
        });
        if (openBtn) openBtn.addEventListener("click", async function(e) {
            e.stopPropagation();
            await openFile();
        });
    });

    // Экспортируем для тестов/расширения
    window.fileIO = {
        saveFile, saveFileAs, openFile, getDataToSave, loadDataFromJson
    };
})();
