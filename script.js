const firebaseConfig = {
  apiKey: "AIzaSyBlz770hOPbeTNIaejSr6-qzF26KwEqKk4",
  authDomain: "system-66bf8.firebaseapp.com",
  projectId: "system-66bf8",
  storageBucket: "system-66bf8.firebasestorage.app",
  messagingSenderId: "1016666864435",
  appId: "1:1016666864435:web:5ecbb04fd9c6b78366dc46",
  measurementId: "G-K75MXCLFD2"
};

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    document.addEventListener('DOMContentLoaded', () => {
        let currentUser = null;
        let templates = [];    
        let history = [];
        let currentTemplate = null;
        let currentPage = 'loading';
        let currentReportData = null;
        let signaturePads = new Map();
        
        const appContainer = document.getElementById('app-container');
        const modalContainer = document.getElementById('modal-container');

        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                loadInitialData(); 
            } else {
                auth.signInAnonymously().catch(error => {
                    console.error("Anonymous sign-in failed:", error);
                    appContainer.innerHTML = `<div class="page-content"><p>Error connecting to the service. Please refresh the page.</p></div>`;
                });
            }
        });

        async function loadInitialData() {
            if (!currentUser) return;
            appContainer.innerHTML = `<div class="page-content"><p>Loading your data...</p></div>`;
            
            const myTemplatesQuery = db.collection('templates').where('userId', '==', currentUser.uid).get();
            const publicTemplatesQuery = db.collection('templates').where('isPublic', '==', true).get();
            const [myTemplatesSnapshot, publicTemplatesSnapshot] = await Promise.all([myTemplatesQuery, publicTemplatesQuery]);
            const myTemplates = myTemplatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const publicTemplates = publicTemplatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allTemplatesMap = new Map();
            myTemplates.forEach(t => allTemplatesMap.set(t.id, t));
            publicTemplates.forEach(t => allTemplatesMap.set(t.id, t));
            templates = Array.from(allTemplatesMap.values());
            const historyQuery = await db.collection('history').where('userId', '==', currentUser.uid).get();
            history = historyQuery.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if(currentPage === 'loading') {
                navigateTo('dashboard');
            } else {
                renderApp();
            }
        }

        function navigateTo(pageName, options = {}) {
            currentPage = pageName;
            if (options.reportData) currentReportData = options.reportData;
            renderApp();
            
            if (pageName === 'templateEditor' && options.highlightId) {
                const newBlock = document.querySelector(`[data-id="${options.highlightId}"]`);
                if (newBlock) {
                    newBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    newBlock.classList.add('highlight');
                    setTimeout(() => newBlock.classList.remove('highlight'), 1500);
                }
            }
        }
        
        function renderApp() {
            appContainer.innerHTML = '';
            let pageHtml = '';
            
            if (!currentUser) {
                appContainer.innerHTML = `<div class="page-content"><p>Connecting...</p></div>`;
                return;
            }

            switch (currentPage) {
                case 'dashboard': pageHtml = renderDashboard(); break;
                case 'templateList': pageHtml = renderTemplateList(); break;
                case 'templateEditor': pageHtml = renderTemplateEditor(); break;
                case 'inspection': pageHtml = renderInspectionPage(); break;
                case 'history': pageHtml = renderHistoryPage(); break;
                case 'report': pageHtml = renderReportPage(currentReportData); break;
                default: pageHtml = `<div class="page-content"><p>Loading...</p></div>`;
            }
            appContainer.innerHTML = pageHtml;
            bindPageEvents();
        }
        
        // --- HELPER FUNCTIONS ---
        async function exportReportAsPDF() {
            const printBtn = document.getElementById('print-report-btn');
            const reportElement = document.querySelector('#app-container .page');

            if (!reportElement || !printBtn) {
                alert('Could not find report element to export.');
                return;
            }

            const originalBtnText = printBtn.innerHTML;
            printBtn.disabled = true;
            printBtn.innerHTML = 'Generating PDF...';
            document.body.classList.add('is-exporting');

            try {
                const images = reportElement.querySelectorAll('img');
                const promises = [];
                images.forEach(img => {
                    if (!img.complete) {
                        promises.push(new Promise((resolve) => {
                            img.onload = resolve;
                            img.onerror = resolve;
                        }));
                    }
                });
                await Promise.all(promises);

                const canvas = await html2canvas(reportElement, {
                    scale: 2,
                    useCORS: true
                });

                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({
                    orientation: 'p',
                    unit: 'mm',
                    format: 'a4'
                });

                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const canvasAspectRatio = canvas.width / canvas.height;
                const totalPDFHeight = pdfWidth / canvasAspectRatio;
                
                let heightLeft = totalPDFHeight;
                let position = 0;

                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, totalPDFHeight);
                heightLeft -= pdfHeight;

                while (heightLeft > 0) {
                    position = -heightLeft;
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, totalPDFHeight);
                    heightLeft -= pdfHeight;
                }
                
                const fileName = `Report-${currentReportData.templateName.replace(/ /g, '_')}-${new Date().toISOString().slice(0,10)}.pdf`;
                const blob = pdf.output('blob');
                const blobUrl = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = fileName;

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                URL.revokeObjectURL(blobUrl);

            } catch (error) {
                console.error('A detailed error occurred during PDF generation:', error);
                alert('An error occurred while generating the PDF. Please check the developer console (F12) for more details.');
            } finally {
                document.body.classList.remove('is-exporting');
                printBtn.disabled = false;
                printBtn.innerHTML = originalBtnText;
            }
        }
        
        function getContrastingTextColor(hex) {
            if (!hex) return '#000000';
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (brightness > 128) ? 'black' : 'white';
        }

        function buildItemTree(items) {
            if (!items) return [];
            const itemMap = new Map(items.map(item => [item.id, { ...item, children: [] }]));
            const tree = [];
            for (const item of itemMap.values()) {
                if (item.parentId && itemMap.has(item.parentId)) {
                    const parent = itemMap.get(item.parentId);
                    if (parent) parent.children.push(item);
                } else {
                    tree.push(item);
                }
            }
            return tree;
        }

        function cloneTemplate(templateToClone) {
            const newTemplate = JSON.parse(JSON.stringify(templateToClone));
            newTemplate.id = Date.now();
            newTemplate.name = `${templateToClone.name} (Copy)`;
            newTemplate.userId = currentUser.uid;
            const idMap = new Map();
            newTemplate.items.forEach(item => {
                const oldId = item.id;
                const newId = Date.now() + Math.random(); 
                idMap.set(oldId, newId);
                item.id = newId;
            });
            newTemplate.items.forEach(item => {
                if (item.parentId && idMap.has(item.parentId)) {
                    item.parentId = idMap.get(item.parentId);
                }
            });
            return newTemplate;
        }

   function calculateScoresRecursive(node, itemMap, scoresMap) {
   if (scoresMap.has(node.id)) return scoresMap.get(node.id);

   let rawScoreSum = 0;
   let rawMaxScoreSum = 0;

   if (node.type === 'section') {
       (node.children || []).forEach(child => {
            const childResult = calculateScoresRecursive(child, itemMap, scoresMap);
            rawScoreSum += childResult.rawScore;
            rawMaxScoreSum += childResult.rawMaxScore;
       });
   } else {
       const itemEl = document.querySelector(`.inspection-item[data-item-id="${node.id}"]`);
       if (itemEl && ['Multiple-Choice', 'Single-Choice', 'Dropdown', 'Multi-Checkbox'].includes(node.type)) {
           

           if (node.type === 'Multiple-Choice' || node.type === 'Multi-Checkbox') {
       
               rawMaxScoreSum = (node.options || []).reduce((sum, opt) => sum + (opt.score > 0 ? opt.score : 0), 0);
           } else {
       
               rawMaxScoreSum = Math.max(0, ...(node.options || []).map(o => o.score));
           }

          
           let value = null;
           if (node.type === 'Multiple-Choice' || node.type === 'Single-Choice') {
               const selectedBtns = Array.from(itemEl.querySelectorAll('.choice-btn.selected'));
               if (selectedBtns.length > 0) value = selectedBtns.map(btn => btn.dataset.value);
           } else if (node.type === 'Multi-Checkbox') {
               value = Array.from(itemEl.querySelectorAll('.inspection-control-multi:checked')).map(cb => cb.value);
           } else if (node.type === 'Dropdown') {
               const selectedValue = itemEl.querySelector('.inspection-control').value;
               if (selectedValue) value = [selectedValue];
           }

           if (value) {
               value.forEach(val => {
                   const selectedOption = node.options.find(o => o.text === val);
              
                   if (selectedOption) {
                       rawScoreSum += selectedOption.score;
                   }
               });
           }
       }
   }

   const finalPercentageScore = rawMaxScoreSum > 0 ? (rawScoreSum / rawMaxScoreSum) * 100 : 0;
   const result = { weightedScore: finalPercentageScore, rawScore: rawScoreSum, rawMaxScore: rawMaxScoreSum };
   scoresMap.set(node.id, result);
   return result;
}

        function updateInspectionProgress() {
            if (!currentTemplate) return;
            const items = currentTemplate.items;
            const itemMap = new Map(items.map(item => [item.id, { ...item }]));
            const tree = buildItemTree(items);
            const scoresMap = new Map();
            tree.forEach(rootNode => calculateScoresRecursive(rootNode, itemMap, scoresMap));
            scoresMap.forEach((result, id) => {
                const item = itemMap.get(id);
                if (item && item.type === 'section') {
                    const displayEl = document.getElementById(`section-score-display-${id}`);
                    if (displayEl) {
                        const percentage = result.weightedScore.toFixed(0);
                        displayEl.textContent = `Score: ${result.rawScore}/${result.rawMaxScore} (${percentage}%)`;
                    }
                }
            });
            const overallResult = calculateOverallScore(tree, scoresMap);
            const overallPercentageRounded = overallResult.weightedScore.toFixed(0);
            const scoreDisplay = document.getElementById('inspection-score');
            const progressBar = document.getElementById('progress-bar-inner');
            if (scoreDisplay) scoreDisplay.textContent = `Overall Score: ${overallResult.rawScore}/${overallResult.rawMaxScore} (${overallPercentageRounded}%)`;
            if (progressBar) progressBar.style.width = `${overallPercentageRounded}%`;
        }

        function sanitizeForFirestore(input) {
            if (input === undefined) return null;
            if (input === null) return null;
            if (Array.isArray(input)) {
                return input.map(sanitizeForFirestore).filter(v => v !== undefined);
            }
            if (typeof input === 'object') {
                const out = {};
                for (const [k, v] of Object.entries(input)) {
                    if (v === undefined) continue;
                    out[k] = sanitizeForFirestore(v);
                }
                return out;
            }
            if (Number.isNaN(input)) return null;
            return input;
        }

        // --- PAGE RENDERERS ---
        function renderDashboard() {
            return `<div class="page"><div class="page-header"><h1>Safety Dashboard</h1></div><div class="page-content"><div class="dashboard-grid"><div class="stat-card"><div class="stat-value">${templates.length}</div><div class="stat-label">Total Templates</div></div><div class="stat-card"><div class="stat-value">${history.length}</div><div class="stat-label">Your Inspections</div></div></div><div style="display: flex; gap: 20px; margin-top: 30px;"><button id="go-to-templates-btn" class="btn btn-primary" style="flex: 1;">Manage Templates</button><button id="go-to-history-btn" class="btn btn-secondary" style="flex: 1;">Inspection History</button></div></div></div>`;
        }

        function renderTemplateListItems(templatesToRender) {
            if (templatesToRender.length === 0) return "<p>No templates match your search.</p>";
            
            return templatesToRender.map(template => {
                const isOwner = template.userId === currentUser.uid;
                const publicBadge = template.isPublic ? `<span style="background: #eef2ff; color: #6D5DE7; padding: 3px 8px; border-radius: 5px; font-size: 0.8rem; margin-left: 10px;">Public</span>` : '';
                
                let dropdownButtons = '';
                if (isOwner) {
                    dropdownButtons += `<button class="btn edit-template-btn" data-id="${template.id}">Edit</button>`;
                }
                dropdownButtons += `<button class="btn duplicate-template-btn" data-id="${template.id}">Duplicate</button>`;
                dropdownButtons += `<button class="btn export-template-btn" data-id="${template.id}">Export</button>`;
                if (isOwner) {
                    dropdownButtons += `<button class="btn delete-template-btn" data-id="${template.id}" style="color: var(--danger-color);">Delete</button>`;
                }

                const actionsHtml = `
                    <button class="btn btn-primary start-inspection-btn" data-id="${template.id}">Start Inspection</button>
                    <div class="dropdown">
                        <button class="btn-icon dropdown-toggle-btn" data-template-id="${template.id}">⋮</button>
                        <div class="dropdown-content" id="dropdown-${template.id}">
                            ${dropdownButtons}
                        </div>
                    </div>
                `;

                return `<li class="list-item">
                            <span>${template.name}${publicBadge}</span>
                            <div class="actions">${actionsHtml}</div>
                        </li>`;
            }).join('');
        }
        
        function renderTemplateList() {
            const listItemsHtml = renderTemplateListItems(templates);
            return `<div class="page"><div class="page-header"><h1>Inspection Templates</h1><div><button id="import-template-btn" class="btn btn-secondary">Import Template</button><button id="go-to-editor-btn" class="btn btn-primary">Create New</button><button class="btn btn-secondary back-to-dashboard-btn">Back</button></div></div><div class="page-content"><div class="form-group"><input type="search" id="template-search-input" class="form-control" placeholder="Search templates by name..."></div><ul class="list" id="template-list-ul">${listItemsHtml}</ul></div></div>`;
        }

        function renderItemsRecursive(parentId, items, renderFunction) {
            const children = items.filter(item => item.parentId === parentId);
            return children.map(item => renderFunction(item, items)).join('');
        }
        
        function renderTemplateEditor() {
            const items = currentTemplate.items || [];
            function renderEditorItem(item, allItems) {
                if (item.type === 'section') {
                    const childrenHtml = renderItemsRecursive(item.id, allItems, renderEditorItem);
                    return `<div class="section-block draggable" data-id="${item.id}"><div class="section-header"><button class="btn-icon drag-handle">⠿</button><input type="text" class="form-control section-label-input" data-id="${item.id}" value="${item.label}" placeholder="Type section name"><label style="margin-left: 15px; font-size: 0.9rem; color: var(--muted-color); white-space: nowrap;">Weight:</label><input type="number" class="form-control section-weight-input" data-id="${item.id}" value="${item.weight || 1}" style="width: 80px; flex-grow: 0; text-align: center;" min="0" step="0.1"><button class="btn-icon delete-item-btn" data-id="${item.id}">🗑️</button></div><div class="question-container" data-id="${item.id}">${childrenHtml}</div></div>`;
                } else {
                    return renderQuestionBlock(item);
                }
            }
            const editorHtml = renderItemsRecursive(null, items, renderEditorItem);
            const isPublicChecked = currentTemplate.isPublic ? 'checked' : '';
            const publicToggleHtml = `<div class="form-group" style="display: flex; align-items: center; gap: 15px; border-top: 1px solid var(--border-color); padding-top: 20px; margin-top: 20px;"><label for="public-toggle" style="margin-bottom:0;">Make this template public:</label><input type="checkbox" id="public-toggle" ${isPublicChecked}><small>Anyone will be able to see and use this template.</small></div>`;
            return `<div class="page"><div class="page-header"><h1>${currentTemplate.name ? 'Editing: ' + currentTemplate.name : 'Create New Template'}</h1><div><button id="preview-template-btn" class="btn btn-secondary">Preview</button><button id="save-template-btn" class="btn btn-primary">Save</button><button class="btn btn-secondary back-to-templates-btn">Cancel</button></div></div><div class="page-content"><div class="form-group"><label for="template-name-input">Template Name</label><input type="text" id="template-name-input" class="form-control" value="${currentTemplate.name || ''}" placeholder="e.g., Daily Safety Check"></div>${publicToggleHtml}<div class="editor-layout" style="margin-top:20px;"><div id="item-list-container">${editorHtml}</div><div class="add-buttons-container"><button id="add-new-question-btn" class="add-btn"><span>+</span> Add Question</button><button id="add-new-section-btn" class="add-btn"><span>+</span> Add Section</button></div></div></div></div>`;
        }
        
        function renderQuestionBody(item, mode = 'block') {
            // === CHANGE POINT 1: Update the list of types for the dropdown ===
            const types = ['Single-Choice', 'Multiple-Choice', 'Dropdown', 'Text', 'Number', 'Date', 'Signature'];
            const typeOptions = types.map(t => `<option value="${t}" ${item.type === t ? 'selected' : ''}>${t}</option>`).join('');
            
            if (mode === 'inline') return `<select class="form-control response-type-select-inline response-type-select" data-id="${item.id}">${typeOptions}</select>`;
            
            let configHtml = '';
            // === CHANGE POINT 2: Update the logic check to use the new names ===
            if (['Single-Choice', 'Multiple-Choice', 'Dropdown'].includes(item.type)) {
                const responseItems = (item.options || []).map((opt, index) => `<div class="response-item draggable"><button class="btn-icon drag-handle">⠿</button><input type="text" class="form-control response-text-input" data-id="${item.id}" data-index="${index}" value="${opt.text}" placeholder="Response Label"><label>Score:</label><input type="number" class="form-control response-score-input" data-id="${item.id}" data-index="${index}" value="${opt.score}"><input type="color" class="response-color-input" data-id="${item.id}" data-index="${index}" value="${opt.color || '#28a745'}"><button class="btn btn-icon delete-response-btn" data-id="${item.id}" data-index="${index}">&times;</button></div>`).join('');
                configHtml = `<div class="form-group"><label>Responses</label><div class="response-editor" data-item-id="${item.id}">${responseItems}</div><button class="add-response-btn" data-id="${item.id}">+ Add Response</button></div>`;
            }
            return configHtml;
        }

        function renderQuestionBlock(item) {
            const bodyContent = renderQuestionBody(item, 'block');
            const inlineTypeSelector = renderQuestionBody(item, 'inline');
            // === CHANGE POINT 3: Update the logic for hiding/showing the response editor ===
            return `<div class="question-block draggable" data-id="${item.id}"><button class="btn-icon question-drag-handle drag-handle">⠿</button><div class="question-main-content"><div class="question-header"><input type="text" class="form-control question-label-input" data-id="${item.id}" value="${item.label}" placeholder="Type question...">${inlineTypeSelector}</div><div class="question-body ${['Single-Choice', 'Multiple-Choice', 'Dropdown'].includes(item.type) ? '' : 'hidden'}">${bodyContent}</div><div class="question-footer"><div class="footer-actions"><label><input type="checkbox" class="required-checkbox" data-id="${item.id}" ${item.required ? 'checked' : ''}> Required</label></div><button class="btn-icon delete-item-btn" data-id="${item.id}" title="Delete Question">🗑️</button></div></div></div>`;
        }

        function renderSingleInspectionItem(item) {
            let controlsHtml = '';
            switch (item.type) {
                // === CHANGE POINT 4: Update the switch cases to use new names and logic ===
                case 'Multiple-Choice': 
                case 'Single-Choice': 
                    controlsHtml = `<div class="button-group" data-selection-mode="${item.type === 'Single-Choice' ? 'single' : 'multi'}">${(item.options || []).map(opt => `<button type="button" class="btn choice-btn" data-value="${opt.text}" data-color="${opt.color || '#f8f9fa'}">${opt.text}</button>`).join('')}</div>`; 
                    break;
                case 'Multi-Checkbox': controlsHtml = `<div class="multi-checkbox-group">${(item.options || []).map(opt =>`<label><input type="checkbox" class="inspection-control-multi" value="${opt.text}"> ${opt.text}</label>`).join('')}</div>`; break;
                case 'Dropdown': controlsHtml = `<select class="form-control inspection-control"><option value="">-- Select --</option>${(item.options || []).map(opt => `<option value="${opt.text}">${opt.text}</option>`).join('')}</select>`; break;
                case 'Text': controlsHtml = `<input type="text" class="form-control inspection-control">`; break;
                case 'Number': controlsHtml = `<input type="number" class="form-control inspection-control">`; break;
                case 'Date': controlsHtml = `<input type="date" class="form-control inspection-control">`; break;
                case 'Signature': controlsHtml = `<div class="form-group"><label>Signature</label><canvas class="signature-pad" width="300" height="100"></canvas><button type="button" class="btn btn-secondary btn-sm clear-signature-btn" style="margin-top: 5px;">Clear</button></div><div class="form-group"><label>Printed Name</label><input type="text" class="form-control signature-name-input" placeholder="Type name here..."></div>`; break;
            }
            const showExtras = !['Date', 'Signature', 'Text', 'Number'].includes(item.type);
            const showLabel = !['Date', 'Signature'].includes(item.type);
            const labelHtml = showLabel ? `<div class="item-label">${item.label}</div>` : '';
            let notesAndAttachmentsHtml = '';
            if (showExtras) {
                notesAndAttachmentsHtml = `<div class="form-group" style="margin-top: 15px;">
                                                <label>Notes</label>
                                                <textarea class="form-control notes"></textarea>
                                                <div class="attachment-area">
                                                    <input type="file" class="file-input" accept="image/*" id="file-${item.id}">
                                                    <label for="file-${item.id}" class="btn">Attach Photo</label>
                                                    <img class="image-preview hidden" src="" alt="Image Preview">
                                                </div>
                                            </div>`;
            }
            return `<li class="inspection-item" data-item-id="${item.id}">
                        ${labelHtml}
                        <div class="inspection-controls">${controlsHtml}</div>
                        ${notesAndAttachmentsHtml}
                    </li>`;
        }
        
        function renderInspectionItemsHTML(template) {
            const items = template.items || [];
            function renderInspectionItem(item, allItems) {
                if (item.type === 'section') {
                    const childrenHtml = renderItemsRecursive(item.id, allItems, renderInspectionItem);
                    return `<div class="inspection-section" data-section-id="${item.id}"><div class="inspection-header"><h2>${item.label}</h2><div class="section-score-display" id="section-score-display-${item.id}"></div></div><ul class="list">${childrenHtml}</ul></div>`;
                } else { return renderSingleInspectionItem(item); }
            }
            return renderItemsRecursive(null, items, renderInspectionItem);
        }

        function renderInspectionPage() {
            const inspectionItems = renderInspectionItemsHTML(currentTemplate);
            return `<div class="page"><div class="page-header"><h1>Inspecting: ${currentTemplate.name}</h1><div id="inspection-score" style="font-weight: 600; font-size: 1.2rem; color: var(--primary-color);">Score: 0%</div><div><button id="back-without-saving-btn" class="btn btn-secondary">Back</button><button id="complete-inspection-btn" class="btn btn-primary">Complete</button></div></div><div class="page-content"><div class="progress-bar"><div id="progress-bar-inner" class="progress-bar-inner"></div></div><div class="list">${inspectionItems}</div></div></div>`;
        }

        function renderHistoryPage() {
            let historyItems = history.slice().reverse().map(record => `<li class="list-item"><span>${record.templateName} - ${new Date(record.date).toLocaleString()}</span><div class="actions"><button class="btn btn-primary view-report-btn" data-id="${record.id}">View Report</button><button class="btn btn-danger delete-history-btn" data-id="${record.id}">Delete</button></div></li>`).join('');
            if (history.length === 0) historyItems = "<p>No inspection history found.</p>";
            return `<div class="page"><div class="page-header"><h1>History</h1><button class="btn btn-secondary back-to-dashboard-btn">Back</button></div><div class="page-content"><ul class="list">${historyItems}</ul></div></div>`;
        }
        
        function renderReportPage(reportData) {
            if (!reportData || !reportData.sectionsTree) return `<div class="page"><div class="page-header"><h1>Report</h1></div><div class="page-content"><p>Report data is missing or invalid.</p></div></div>`;
            
            function renderReportNodeRecursive(node) {
                if (node.type === 'section') {
                    const result = reportData.scores[node.id] || { weightedScore: 0, rawScore: 0, rawMaxScore: 0 };
                    const sectionScorePercent = result.weightedScore.toFixed(0);
                    const headerHtml = `<div class="report-section-header"><h2>${node.label}</h2><span class="report-section-score">Score: ${result.rawScore}/${result.rawMaxScore} (${sectionScorePercent}%)</span></div>`;
                    const childrenHtml = (node.children || []).map(renderReportNodeRecursive).join('');
                    return `<div class="report-section inspection-section">${headerHtml}<div class="list">${childrenHtml}</div></div>`;
                } else { 
                    const ans = node.answerData;
                    if (!ans) return ''; 
                    let valueDisplay = '<i>Not Answered</i>';
                    let style = '';
                    if (ans.value !== null && ans.value !== undefined && ans.value !== '') {
                        if (typeof ans.value === 'object' && !Array.isArray(ans.value) && (ans.value.signature || ans.value.name)) {
                            const sigImg = ans.value.signature ? `<img src="${ans.value.signature}" alt="Signature" style="border: 1px solid #ccc; max-width: 100%; max-height: 80px;"/>` : '';
                            const sigName = ans.value.name ? `<p>${ans.value.name}</p>` : '';
                            valueDisplay = (sigName + sigImg) || '<i>(Not provided)</i>';
                        } else if (typeof ans.value === 'object' && !Array.isArray(ans.value) && ans.value.hasOwnProperty('text')) {
                            valueDisplay = ans.value.text;
                            if (ans.value.color) {
                                const hex = ans.value.color.replace('#', '');
                                const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
                                const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                                const textColor = brightness > 125 ? '#000000' : '#FFFFFF';
                                style = `style="background-color: ${ans.value.color}; color: ${textColor}; padding: 3px 8px; border-radius: 5px; display: inline-block;"`;
                            }
                        } else if (Array.isArray(ans.value)) {
                            if (ans.value.length === 0) { valueDisplay = '<i>(None selected)</i>'; }
                            else { valueDisplay = ans.value.map(v => {
                                    let itemStyle = '';
                                    if (v.color) {
                                        const hex = v.color.replace('#', '');
                                        const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
                                        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                                        const textColor = brightness > 125 ? '#000000' : '#FFFFFF';
                                        itemStyle = `style="background-color: ${v.color}; color: ${textColor}; padding: 3px 8px; border-radius: 5px; display: inline-block; margin-right: 5px;"`;
                                    }
                                    return `<span ${itemStyle}>${v.text}</span>`;
                                }).join(' '); }
                        } else { valueDisplay = ans.value.toString(); }
                    }
                    const evidenceHtml = ans.evidence ? `<div style="margin-top: 10px;"><p><strong>Evidence:</strong><br><img crossorigin="anonymous" src="${ans.evidence}" alt="Evidence" style="max-width: 200px; margin-top: 5px;"/></p></div>` : '';
                    return `<div class="inspection-item"><div class="report-item-row"><div class="report-item-label">${ans.label}</div><div class="report-item-result"><span ${style}>${valueDisplay}</span></div></div>${ans.notes ? `<div style="padding-left: 10px; border-left: 3px solid #eee; margin-top: 10px; font-style: italic;"><strong>Notes:</strong> ${ans.notes}</div>` : ''}${evidenceHtml}</div>`;
                }
            }
           const summaryHtml = `<div class="report-section"><h2>Inspection Summary</h2><p><strong>Date:</strong> ${new Date(reportData.date).toLocaleString()}</p><p><strong>Overall Safety Score:</strong> ${reportData.totalRawScore}/${reportData.totalRawMaxScore} (${reportData.overallScore.toFixed(0)}%)</p></div>`;
            const sectionsHtml = reportData.sectionsTree.map(renderReportNodeRecursive).join('');
            
            return `<div class="page">
                <div class="page-header">
                    <div style="width: 300px;"></div> 
                    <h1 style="flex-grow: 1; text-align: center;">${reportData.templateName}</h1>
                    <div style="width: 300px; text-align: right;">
                        <button id="print-report-btn" class="btn btn-secondary">Print / Export PDF</button>
                        <button class="btn btn-secondary back-to-dashboard-btn">Back</button>
                    </div>
                </div>
                <div class="page-content" id="report-content">${summaryHtml}${sectionsHtml}</div>
            </div>`;
        }

        // --- EVENT BINDING ---
        window.addEventListener('click', function(event) {
            if (!event.target.matches('.dropdown-toggle-btn')) {
                document.querySelectorAll(".dropdown-content.show").forEach(dropdown => {
                    dropdown.classList.remove('show');
                });
            }
        });

        function bindPageEvents() {
            const eventMap = {
                '#go-to-templates-btn': { event: 'click', handler: () => navigateTo('templateList') },
                '#go-to-history-btn': { event: 'click', handler: () => navigateTo('history') },
                '.back-to-dashboard-btn': { event: 'click', handler: () => navigateTo('dashboard') },
                '#go-to-editor-btn': { event: 'click', handler: () => {
                    currentTemplate = { name: '', isPublic: false, items: [], userId: currentUser.uid };
                    navigateTo('templateEditor');
                }},
                 '#template-search-input': { 
                event: 'input', 
                handler: (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    const filteredTemplates = templates.filter(t => t.name.toLowerCase().includes(searchTerm));
                    const listContainer = document.getElementById('template-list-ul');
                    if (listContainer) {
                        listContainer.innerHTML = renderTemplateListItems(filteredTemplates);
                        bindPageEvents(); // เรียกเพื่อผูก Event ให้ปุ่มในรายการที่สร้างใหม่
                    }
                }
            },
                '.edit-template-btn': { event: 'click', handler: (e) => {
                    const templateId = e.target.dataset.id;
                    const foundTemplate = templates.find(t => t.id === templateId)
                    currentTemplate = JSON.parse(JSON.stringify(foundTemplate));
                    if (currentTemplate) navigateTo('templateEditor');
                }},
                '.duplicate-template-btn': { event: 'click', handler: async (e) => {
                    const templateId = e.target.dataset.id;
                    const originalTemplate = templates.find(t => t.id === templateId);
                    if (originalTemplate) {
                        const newTemplateData = cloneTemplate(originalTemplate);
                        delete newTemplateData.id;
                        await db.collection('templates').add(newTemplateData);
                        await loadInitialData();
                    }
                }},
                '.delete-template-btn': { event: 'click', handler: async e => {
                    const templateId = e.target.dataset.id;
                    if (confirm(`Are you sure you want to delete this template?`)) {
                        await db.collection('templates').doc(templateId).delete();
                        await loadInitialData();
                    }
                }},
                '.delete-history-btn': { event: 'click', handler: async e => {
                    const recordId = e.target.dataset.id;
                    if (confirm(`Are you sure you want to delete this inspection record?`)) {
                        await db.collection('history').doc(recordId).delete();
                        await loadInitialData();
                    }
                }},
                '.start-inspection-btn': { event: 'click', handler: (e) => {
                    const templateId = e.target.dataset.id;
                    const originalTemplate = templates.find(t => t.id === templateId);
                    if (originalTemplate) {
                        currentTemplate = JSON.parse(JSON.stringify(originalTemplate));
                        navigateTo('inspection');
                    }
                }},
                '.view-report-btn': { event: 'click', handler: (e) => {
                    const reportId = e.target.dataset.id;
                    const reportData = history.find(h => h.id === reportId);
                    if (reportData) navigateTo('report', { reportData });
                }},
                '#public-toggle': { event: 'change', handler: (e) => {
                    if (currentTemplate) {
                        currentTemplate.isPublic = e.target.checked;
                    }
                }},
                '.back-to-templates-btn': { event: 'click', handler: () => navigateTo('templateList') },
                '#template-name-input': { event: 'input', handler: e => { if(currentTemplate) currentTemplate.name = e.target.value; }},
                '#add-new-question-btn': { event: 'click', handler: () => {
                    const lastSelectedItem = document.querySelector('.sortable-chosen > .question-container, .sortable-chosen[data-id]');
                    const parentId = lastSelectedItem ? Number(lastSelectedItem.dataset.id) : null;
                    // === CHANGE POINT 5: Set the default new question type to 'Single-Choice' ===
                    const newItem = { id: Date.now() + Math.random(), type: 'Single-Choice', label: 'New Question', options: [{text: 'Pass', score: 1, color: '#28a745'}, {text: 'Fail', score: 0, color: '#dc3545'}], required: false, parentId };
                    currentTemplate.items.push(newItem);
                    navigateTo('templateEditor', { highlightId: newItem.id });
                }},
                '#add-new-section-btn': { event: 'click', handler: () => {
                    const lastSelectedItem = document.querySelector('.sortable-chosen > .question-container, .sortable-chosen[data-id]');
                    const parentId = lastSelectedItem ? Number(lastSelectedItem.dataset.id) : null;
                    const newSection = { id: Date.now() + Math.random(), type: 'section', label: 'New Section', weight: 1, parentId };
                    currentTemplate.items.push(newSection);
                    navigateTo('templateEditor', { highlightId: newSection.id });
                }},
                '.delete-item-btn': { event: 'click', handler: e => {
                    const itemId = Number(e.target.closest('.draggable').dataset.id);
                    const idsToDelete = new Set([itemId]);
                    const queue = currentTemplate.items.filter(i => i.parentId === itemId);
                    while(queue.length > 0) {
                        const currentItem = queue.shift();
                        idsToDelete.add(currentItem.id);
                        currentTemplate.items.filter(i => i.parentId === currentItem.id).forEach(child => queue.push(child));
                    }
                    currentTemplate.items = currentTemplate.items.filter(item => !idsToDelete.has(item.id));
                    renderApp();
                }},
                '#save-template-btn': { event: 'click', handler: async () => {
                    if (!currentUser) return alert("You must be logged in to save.");
                    if (!currentTemplate.name) currentTemplate.name = 'Untitled Template';
                    const templateData = { ...currentTemplate, userId: currentUser.uid };
                    const saveBtn = document.getElementById('save-template-btn');
                    if(saveBtn) saveBtn.textContent = "Saving...";
                    try {
                        if (templateData.id && templates.some(t => t.id === templateData.id)) {
                            await db.collection('templates').doc(templateData.id).set(templateData);
                        } else {
                            delete templateData.id;
                            await db.collection('templates').add(templateData);
                        }
                        await loadInitialData();
                        navigateTo('templateList');
                    } catch (error) {
                        console.error("Error saving template: ", error);
                        alert("Could not save template. Please try again.");
                        if(saveBtn) saveBtn.textContent = "Save";
                    }
                }},
                '#complete-inspection-btn': { event: 'click', handler: async (e) => {
                    const completeBtn = e.target;
                    const unansweredRequired = [];
                    currentTemplate.items.forEach(item => {
                        if (item.required && item.type !== 'section') {
                            const answer = getAnswerForItem(item);
                                let isNotAnswered = (answer.value === null || answer.value === '' || (Array.isArray(answer.value) && answer.value.length === 0));

                                // Add a special check for Signature type
                                if (item.type === 'Signature' && answer.value) {
                                    isNotAnswered = !answer.value.signature && !answer.value.name;
                                }

                            if (isNotAnswered) {
                                unansweredRequired.push(`- ${item.label}`);
                            }
                        }
                    });
                    if (unansweredRequired.length > 0) {
                        alert('Please answer all required questions:\n' + unansweredRequired.join('\n'));
                        return;
                    }
                    if (!confirm('Are you sure you want to complete and submit this inspection?')) return;
                    completeBtn.disabled = true;
                    completeBtn.textContent = "Submitting...";
                    try {
                        const itemMap = new Map(currentTemplate.items.map(item => [item.id, { ...item, children: [] }]));
                        for (const item of currentTemplate.items) {
                            if (item.type !== 'section') {
                                const answerData = getAnswerForItem(item);
                                if (answerData.evidenceFile) {
                                    const filePath = `inspections/${currentUser.uid}/${Date.now()}-${answerData.evidenceFile.name}`;
                                    const storageRef = storage.ref(filePath);
                                    const uploadTask = await storageRef.put(answerData.evidenceFile);
                                    answerData.evidence = await uploadTask.ref.getDownloadURL(); 
                                }
                                delete answerData.evidenceFile;
                                const hasValue = (answerData.value !== null && answerData.value !== '') || answerData.evidence || answerData.notes;
                                if (hasValue) {
                                    const questionNode = itemMap.get(item.id);
                                    if (questionNode) questionNode.answerData = answerData;
                                }
                            }
                        }
                        const tree = buildItemTree(Array.from(itemMap.values()));
                        const scoresMap = new Map();
                        tree.forEach(rootNode => calculateScoresRecursive(rootNode, itemMap, scoresMap));
                        const overallScore = calculateOverallScore(tree, scoresMap);

                        const plainScores = {};
                        scoresMap.forEach((v, k) => { plainScores[String(k)] = sanitizeForFirestore(v); });

                        const results = {
                            userId: currentUser.uid,
                            templateId: currentTemplate.id,
                            templateName: currentTemplate.name,
                            date: new Date().toISOString(),
                            overallScore: overallScore.weightedScore,
                            totalRawScore: overallScore.rawScore,
                            totalRawMaxScore: overallScore.rawMaxScore,
                            sectionsTree: tree,
                            scores: plainScores
                        };

                        const cleanResults = sanitizeForFirestore(results);
                        const docRef = await db.collection('history').add(cleanResults); 
                        cleanResults.id = docRef.id; 

                        navigateTo('report', { reportData: cleanResults }); 
                    } catch (error) {
                        console.error("Error submitting inspection:", error);
                        alert("Could not submit inspection. Please try again.");
                        completeBtn.disabled = false;
                        completeBtn.textContent = "Complete";
                    }
                }},
                '#print-report-btn': { event: 'click', handler: exportReportAsPDF },
                '.question-label-input, .section-label-input': { event: 'input', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.closest('.draggable').dataset.id));
                    if (item) item.label = e.target.value;
                }},
                '.section-weight-input': { event: 'input', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.closest('.draggable').dataset.id));
                    if (item) item.weight = parseFloat(e.target.value) || 1;
                }},
                '.required-checkbox': { event: 'change', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.closest('.draggable').dataset.id));
                    if (item) item.required = e.target.checked;
                }},
                '.response-type-select': { event: 'change', handler: e => {
                    const itemId = Number(e.target.closest('.draggable').dataset.id);
                    const newType = e.target.value;
                    const item = currentTemplate.items.find(i => i.id === itemId);
                    if (item && item.type !== newType) {
                        item.type = newType;
                        if (newType === 'Date' || newType === 'Signature') item.label = newType; 
                        // === CHANGE POINT 6: Update logic to use new names and consistent default options ===
                        if (['Single-Choice', 'Multiple-Choice', 'Dropdown'].includes(item.type) && (!item.options || item.options.length === 0)) {
                            item.options = [{text: 'Pass', score: 1, color: '#28a745'}, {text: 'Fail', score: 0, color: '#dc3545'}];
                        }
                        const questionBody = e.target.closest('.question-main-content').querySelector('.question-body');
                        questionBody.innerHTML = renderQuestionBody(item);
                        questionBody.classList.toggle('hidden', !['Single-Choice', 'Multiple-Choice', 'Dropdown'].includes(item.type));
                        bindEditorDragDrop();
                        bindPageEvents();
                    }
                }},
                '.add-response-btn': { event: 'click', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.dataset.id));
                    if (item) {
                        if(!item.options) item.options = [];
                        item.options.push({ text: 'New Response', score: 0, color: '#6c757d' });
                        const questionBody = e.target.closest('.question-body');
                        if (questionBody) questionBody.innerHTML = renderQuestionBody(item);
                        bindEditorDragDrop();
                        bindPageEvents();
                    }
                }},
                '.delete-response-btn': { event: 'click', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.dataset.id));
                    if (item) {
                        item.options.splice(Number(e.target.dataset.index), 1);
                        const questionBody = e.target.closest('.question-body');
                        if (questionBody) questionBody.innerHTML = renderQuestionBody(item);
                        bindEditorDragDrop();
                        bindPageEvents();
                    }
                }},
                '.response-text-input': { event: 'input', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.dataset.id));
                    if (item) item.options[Number(e.target.dataset.index)].text = e.target.value;
                }},
                '.response-score-input': { event: 'input', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.dataset.id));
                    if (item) item.options[Number(e.target.dataset.index)].score = Number(e.target.value);
                }},
                '.response-color-input': { event: 'input', handler: e => {
                    const item = currentTemplate.items.find(i => i.id === Number(e.target.dataset.id));
                    if (item) item.options[Number(e.target.dataset.index)].color = e.target.value;
                }},
                '#back-without-saving-btn': { event: 'click', handler: () => {
                    if (confirm('Are you sure you want to go back? All progress will be lost.')) navigateTo('templateList');
                }},
                '.choice-btn': { event: 'click', handler: (e) => {
                    const group = e.target.closest('.button-group');
                    if (!group) return;
                    const selectionMode = group.dataset.selectionMode;
                    const clickedButton = e.target;
                    const color = clickedButton.dataset.color;
                    const textColor = getContrastingTextColor(color);
                    if (selectionMode === 'multi') {
                        const isSelected = clickedButton.classList.toggle('selected');
                        clickedButton.style.backgroundColor = isSelected ? color : '';
                        clickedButton.style.borderColor = isSelected ? color : '';
                        clickedButton.style.color = isSelected ? textColor : '';
                    } else {
                        const wasAlreadySelected = clickedButton.classList.contains('selected');
                        group.querySelectorAll('.choice-btn').forEach(btn => {
                            btn.classList.remove('selected');
                            btn.style.backgroundColor = '';
                            btn.style.borderColor = '';
                            btn.style.color = '';
                        });
                        if (!wasAlreadySelected) {
                            clickedButton.classList.add('selected');
                            clickedButton.style.backgroundColor = color;
                            clickedButton.style.borderColor = color;
                            clickedButton.style.color = textColor;
                        }
                    }
                    updateInspectionProgress();
                }},
                '.inspection-control, .inspection-control-multi': { event: 'change', handler: updateInspectionProgress },
                '.clear-signature-btn': { event: 'click', handler: (e) => {
                    const canvas = e.target.closest('.form-group').querySelector('.signature-pad');
                    const pad = signaturePads.get(canvas); 
                    if (pad) pad.clear(); 
                }},
                '#import-template-btn': { event: 'click', handler: showImportModal },
                '.export-template-btn': { event: 'click', handler: (e) => {
                    const template = templates.find(t => t.id === e.target.dataset.id);
                    if (template) showExportModal(template);
                }},
                '.file-input': { event: 'change', handler: (e) => {
                    const file = e.target.files[0];
                    const preview = e.target.parentElement.querySelector('.image-preview');
                    if (file) {
                        e.target.fileObject = file;
                        const objectUrl = URL.createObjectURL(file);
                        preview.src = objectUrl;
                        preview.classList.remove('hidden');
                        preview.onload = () => URL.revokeObjectURL(preview.src);
                    } else {
                        e.target.fileObject = null;
                        preview.src = "";
                        preview.classList.add('hidden');
                    }
                }},
                '#preview-template-btn': { event: 'click', handler: () => {
                    const previewHtml = renderInspectionItemsHTML(JSON.parse(JSON.stringify(currentTemplate)));
                    showModal('Template Preview', `<div class="list">${previewHtml}</div>`, `<button class="btn btn-secondary close-modal-btn">Close</button>`);
                }},
                '.dropdown-toggle-btn': { event: 'click', handler: (e) => {
                    e.stopPropagation();
                    const templateId = e.target.dataset.templateId;
                    const dropdownContent = document.getElementById(`dropdown-${templateId}`);
                    
                    document.querySelectorAll('.dropdown-content.show').forEach(openDropdown => {
                        if (openDropdown !== dropdownContent) {
                            openDropdown.classList.remove('show');
                        }
                    });

                    dropdownContent.classList.toggle('show');
                }},
            };
            
            for (const selector in eventMap) {
                document.querySelectorAll(selector).forEach(el => {
                    if (el && !el.hasAttribute('data-listener-attached')) {
                        el.addEventListener(eventMap[selector].event, eventMap[selector].handler);
                        el.setAttribute('data-listener-attached', 'true');
                    }
                });
            }
            
            if (currentPage === 'templateEditor') bindEditorDragDrop();
            if (currentPage === 'inspection') {
                signaturePads.clear();
                document.querySelectorAll('.signature-pad').forEach(canvas => {
                    const ratio =  Math.max(window.devicePixelRatio || 1, 1);
                    canvas.width = canvas.offsetWidth * ratio;
                    canvas.height = canvas.offsetHeight * ratio;
                    canvas.getContext("2d").scale(ratio, ratio);
                    const signaturePad = new SignaturePad(canvas);
                    signaturePads.set(canvas, signaturePad);
                });
                updateInspectionProgress();
            }
        }
        
        function bindEditorDragDrop() {
            function syncTemplateOrderAndRerender() {
                const itemMap = new Map(currentTemplate.items.map(item => [String(item.id), item]));
                const newlyOrderedItems = [];
                document.querySelectorAll('#item-list-container .draggable').forEach(node => {
                    const item = itemMap.get(String(node.dataset.id));
                    if (item) {
                        const parentContainer = node.closest('.question-container');
                        item.parentId = parentContainer ? Number(parentContainer.dataset.id) : null;
                        newlyOrderedItems.push(item);
                    }
                });
                currentTemplate.items = newlyOrderedItems;
            }
            document.querySelectorAll('.question-container, #item-list-container, .response-editor').forEach(container => {
                if(container._sortable) container._sortable.destroy();
                Sortable.create(container, {
                    group: 'shared', animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost', onEnd: syncTemplateOrderAndRerender
                });
            });
        }
        
        function showModal(title, content, footer) {
            modalContainer.innerHTML = `<div class="modal-overlay"><div class="modal-content"><div class="modal-header"><h2>${title}</h2><button class="btn-icon close-modal-btn">&times;</button></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div></div>`;
            modalContainer.classList.remove('hidden');
            document.querySelectorAll('.close-modal-btn').forEach(btn => btn.addEventListener('click', hideModal));
        }
        function hideModal() {
            modalContainer.classList.add('hidden');
            modalContainer.innerHTML = '';
        }
        function showImportModal() {
            const content = `<p>Paste the template code below to import.</p><textarea id="import-code" class="form-control"></textarea>`;
            const footer = `<button class="btn btn-secondary close-modal-btn">Cancel</button><button id="confirm-import-btn" class="btn btn-primary">Import</button>`;
            showModal('Import Template', content, footer);
            document.getElementById('confirm-import-btn').addEventListener('click', async () => {
                try {
                    const importedTemplate = JSON.parse(atob(document.getElementById('import-code').value));
                    if (importedTemplate.name && importedTemplate.items) {
                        importedTemplate.userId = currentUser.uid;
                        delete importedTemplate.id;
                        await db.collection('templates').add(importedTemplate);
                        await loadInitialData();
                        navigateTo('templateList');
                        hideModal();
                    } else { alert('Invalid template code.'); }
                } catch (error) { alert('Invalid template code. Please check and try again.'); }
            });
        }
        function showExportModal(template) {
            const exportData = { ...template };
            delete exportData.id;
            delete exportData.userId;
            const exportCode = btoa(JSON.stringify(exportData));
            const content = `<p>Copy the code below to share or back up this template.</p><textarea id="export-code" class="form-control" readonly>${exportCode}</textarea>`;
            const footer = `<button class="btn btn-secondary close-modal-btn">Close</button><button id="copy-code-btn" class="btn btn-primary">Copy Code</button>`;
            showModal(`Export: ${template.name}`, content, footer);
            document.getElementById('copy-code-btn').addEventListener('click', () => {
                const codeText = document.getElementById('export-code');
                codeText.select();
                navigator.clipboard.writeText(codeText.value).then(() => { alert('Code copied to clipboard!'); });
            });
        }
        
        function getAnswerForItem(item) {
            const itemEl = document.querySelector(`.inspection-item[data-item-id="${item.id}"]`);
            if (!itemEl) return { label: item.label, value: null, notes: '', evidenceFile: null };
            let value = null;
            const notes = itemEl.querySelector('.notes')?.value || '';
            const fileInput = itemEl.querySelector('.file-input');
            const evidenceFile = fileInput ? fileInput.fileObject : null;
            
            switch (item.type) {
                // === CHANGE POINT 7: Update switch cases to handle new names ===
                case 'Single-Choice': 
                case 'Multiple-Choice': {
                    const selectedBtns = itemEl.querySelectorAll('.choice-btn.selected');
                    const values = Array.from(selectedBtns).map(btn => {
                        const option = item.options.find(o => o.text === btn.dataset.value);
                        return option ? { text: option.text, ...(option.color ? { color: option.color } : {}) } : null;
                    }).filter(Boolean);
                    if(item.type === 'Single-Choice') { value = values.length > 0 ? values[0] : null; } else { value = values; }
                    break;
                }
                case 'Dropdown': {
                    const selectedValue = itemEl.querySelector('.inspection-control').value;
                    if(selectedValue) {
                        const option = item.options.find(o => o.text === selectedValue);
                        if (option) value = { text: option.text, ...(option.color ? { color: option.color } : {}) };
                    }
                    break;
                }
                case 'Multi-Checkbox': {
                    value = Array.from(itemEl.querySelectorAll('.inspection-control-multi:checked')).map(cb => {
                        const option = item.options.find(o => o.text === cb.value);
                        return option ? { text: option.text, ...(option.color ? { color: option.color } : {}) } : null;
                    }).filter(Boolean);
                    break;
                }
                case 'Signature': {
                    const pad = signaturePads.get(itemEl.querySelector('.signature-pad'));
                    value = { name: itemEl.querySelector('.signature-name-input')?.value || '', signature: (pad && !pad.isEmpty()) ? pad.toDataURL() : null };
                    break;
                }
                case 'Text': case 'Number': case 'Date':
                    value = itemEl.querySelector('.inspection-control').value;
                    break;
            }
            return { label: item.label, value, notes, evidenceFile };
        }
        function calculateOverallScore(tree, scoresMap) {
            let totalWeightedScore = 0, totalWeight = 0, totalRawScore = 0, totalRawMaxScore = 0;
            tree.forEach(rootNode => {
                const result = scoresMap.get(rootNode.id);
                const weight = rootNode.weight || 1;
                if (result) {
                    totalWeightedScore += result.weightedScore * weight;
                    totalWeight += weight;
                    totalRawScore += result.rawScore;
                    totalRawMaxScore += result.rawMaxScore;
                }
            });
            return {
                weightedScore: totalWeight > 0 ? totalWeightedScore / totalWeight : 0,
                rawScore: totalRawScore,
                rawMaxScore: totalRawMaxScore
            };
        }
    });