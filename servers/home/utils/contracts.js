/** @param {NS} ns */
export async function main(ns) {
  // Disable default logs to avoid spam
  ns.disableLog("ALL");

  // Create a map to store solution inputs for different contracts
  const solutionInputs = new Map();

  // Create UI container if it doesn't exist
  let doc = eval("document");
  let contractUI = doc.getElementById("contract-tracker-ui");

  if (contractUI) {
    // Remove existing UI if it's already there (for refreshing/restarting)
    contractUI.remove();
  }

  // Create UI container
  contractUI = doc.createElement("div");
  contractUI.id = "contract-tracker-ui";

  // Set styles for the UI container
  Object.assign(contractUI.style, {
    position: "absolute",
    top: "40px",
    right: "10px",
    width: "600px",
    minHeight: '33px',
    minWidth: '600px',
    maxWidth: 'calc(100dvh-100px)',
    backgroundColor: "#000000",
    color: "rgb(0, 204, 0)",
    padding: "0", // Removed padding to make titlebar flush with edge
    zIndex: "1000",
    fontFamily: 'JetBrainsMono, "Courier New", monospace',
    fontSize: "1.25rem",
    fontWeight: "1.5",
    overflow: "hidden", // Changed from auto to hidden
    display: "flex",
    flexDirection: "column"
  });

  // Create header bar (will remain visible when minimized)
  const headerBar = doc.createElement("div");
  headerBar.style.display = "flex";
  headerBar.style.justifyContent = "space-between";
  headerBar.style.minHeight = "33px";
  headerBar.style.alignItems = "center";
  headerBar.style.backgroundColor = "#000000";
  headerBar.style.padding = "0";
  headerBar.style.boxShadow = "rgba(0, 0, 0, 0.2) 0px 2px 1px -1px, rgba(0, 0, 0, 0.14) 0px 1px 1px 0px, rgba(0, 0, 0, 0.12) 0px 1px 3px 0px";
  headerBar.style.border = "1px solid rgb(68, 68, 68)"
  contractUI.appendChild(headerBar);

  // Title in header
  const title = doc.createElement("div");
  title.innerHTML = `<span style='color: rgb(0, 204, 0);'>${ns.getScriptName()}</span>`;
  headerBar.appendChild(title);

  // Status display (will be hidden when minimized)
  const status = doc.createElement("div");
  status.id = "contract-status";
  status.innerText = "Loading...";
  status.style.marginLeft = "16px";
  status.style.marginRight = "auto";
  status.style.fontSize = "16px";
  headerBar.appendChild(status);

  // Button container
  const buttonContainer = doc.createElement("div");
  buttonContainer.style.display = "flex";
  headerBar.appendChild(buttonContainer);

  // Minimize/maximize button
  const minimizeBtn = doc.createElement("button");
  minimizeBtn.id = "contract-minimize-btn";
  minimizeBtn.style.backgroundColor = "transparent";
  minimizeBtn.style.color = "rgb(0, 204, 0)";
  minimizeBtn.style.borderWidth = "0px 0px 0px 1px";
  minimizeBtn.style.border = "solid rbg(68, 68, 68)";
  minimizeBtn.style.width = "24px";
  minimizeBtn.style.height = "24px";
  minimizeBtn.style.display = "flex";
  minimizeBtn.style.alignItems = "center";
  minimizeBtn.style.justifyContent = "center";
  minimizeBtn.style.cursor = "pointer";
  minimizeBtn.style.fontSize = "23px";
  minimizeBtn.style.padding = "0";
  buttonContainer.appendChild(minimizeBtn);

  const minimizeBtnText = doc.createElement("span");
  minimizeBtnText.id = "contract-minimize-btn-text";
  minimizeBtnText.innerText = '⌄';
  minimizeBtnText.style.width = "24px";
  minimizeBtnText.style.height = "24px";
  minimizeBtn.appendChild(minimizeBtnText);

  // Close button
  const closeBtn = doc.createElement("button");
  closeBtn.innerText = "✕";
  closeBtn.style.backgroundColor = "transparent";
  closeBtn.style.color = "rgb(0, 204, 0)";
  closeBtn.style.borderWidth = "0px 0px 0px 1px";
  closeBtn.style.border = "solid rbg(68, 68, 68)";
  closeBtn.style.width = "24px";
  closeBtn.style.height = "24px";
  closeBtn.style.display = "flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "23px";
  closeBtn.style.padding = "0";
  closeBtn.onclick = () => { ns.exit() };
  buttonContainer.appendChild(closeBtn);

  // Create content wrapper (will be hidden when minimized)
  const contentWrapper = doc.createElement("div");
  contentWrapper.id = "contract-content-wrapper";
  contentWrapper.style.display = 'none';
  contentWrapper.style.border = "1px solid rgb(68, 68, 68)";
  contentWrapper.style.borderTop = "none";
  contentWrapper.style.overflow = "hidden"; // Added to prevent overall scrolling
  contentWrapper.style.maxHeight = "calc(100vh - 100px)"; // Set max height
  contentWrapper.style.position = "relative"; // Added for resize handle positioning
  contractUI.appendChild(contentWrapper);

  // Create content container
  const content = doc.createElement("div");
  content.id = "contract-content";
  content.style.display = "flex";
  content.style.flexGrow = "1";
  content.style.overflow = "hidden";
  content.style.height = "calc(100vh - 100px - 33px)"; // Fixed height (viewport - margins - header)
  contentWrapper.appendChild(content);

  // Create list view
  const listView = doc.createElement("div");
  listView.id = "contract-list";
  listView.style.width = "40%";
  listView.style.maxWidth = "25rem";
  listView.style.overflowY = "auto"; // This stays as auto to allow scrolling
  listView.style.backgroundColor = "#001100";
  listView.style.padding = "5px";
  listView.style.maxHeight = "calc(100vh - 150px)"; // Set max height to ensure scrolling works
  content.appendChild(listView);

  // Create detail view
  const detailView = doc.createElement("div");
  detailView.id = "contract-detail";
  detailView.style.width = "100%";
  detailView.style.overflow = "auto"; // This can also be scrollable
  detailView.style.backgroundColor = "#001100";
  detailView.style.padding = "10px";
  detailView.style.maxHeight = "calc(100vh - 150px)"; // Set max height to ensure scrolling works
  content.appendChild(detailView);

  // Create resize handle (crab handle)
  const resizeHandle = doc.createElement("div");
  resizeHandle.id = "contract-resize-handle";
  resizeHandle.style.position = "absolute";
  resizeHandle.style.bottom = "0";
  resizeHandle.style.right = "0";
  resizeHandle.style.width = "15px";
  resizeHandle.style.height = "15px";
  resizeHandle.style.cursor = "nwse-resize";
  resizeHandle.style.zIndex = "10000";
  resizeHandle.innerHTML = "⊿"; // Triangle symbol for resize handle
  resizeHandle.style.color = "rgb(0, 204, 0)";
  resizeHandle.style.fontSize = "15px";
  resizeHandle.style.lineHeight = "15px";
  resizeHandle.style.textAlign = "center";
  resizeHandle.style.transform = "rotate(-45deg)"; // Rotate to point bottom-right
  contentWrapper.appendChild(resizeHandle);

  // Add UI to document
  doc.body.appendChild(contractUI);

  // Make UI draggable (using headerBar instead of the old header)
  makeElementDraggable(contractUI, headerBar);

  // Make UI resizable
  makeElementResizable(contractUI, contentWrapper, resizeHandle);

  // Variable to track minimized state
  let isMinimized = true;

  // Store the currently selected contract info for persistence across refreshes
  let currentSelection = {
    server: null,
    filename: null,
    index: -1
  };

  // Function to toggle minimized state
  function toggleMinimize() {
    isMinimized = !isMinimized;

    const contentWrapper = doc.getElementById('contract-content-wrapper');
    const minimizeBtn = doc.getElementById('contract-minimize-btn');

    if (isMinimized) {
      // Minimize widget
      contentWrapper.style.display = 'none';
      contractUI.style.maxHeight = 'auto';
      minimizeBtnText.style.rotate = '0deg';
    } else {
      // Maximize widget
      contentWrapper.style.display = 'block';
      minimizeBtnText.style.rotate = '180deg';
      contractUI.style.maxHeight = 'calc(100vh - 250px)';
    }
  }

  // Add click event to minimize button
  minimizeBtn.onclick = toggleMinimize;

  // Function to make an element resizable
  function makeElementResizable(element, contentElement, handleElement) {
    let startX, startY, startWidth, startHeight;

    handleElement.onmousedown = resizeMouseDown;

    function resizeMouseDown(e) {
      e = e || window.event;
      e.preventDefault();

      // Get the initial mouse position
      startX = e.clientX;
      startY = e.clientY;

      // Get the initial size of the element
      startWidth = element.offsetWidth;
      startHeight = contentElement.offsetHeight;

      // Add event listeners for mouse movements and release
      doc.onmousemove = resizeElementDrag;
      doc.onmouseup = stopResize;
    }

    function resizeElementDrag(e) {
      e = e || window.event;
      e.preventDefault();

      // Calculate the new size
      const newWidth = startWidth + (e.clientX - startX);
      const newHeight = startHeight + (e.clientY - startY);

      // Apply the new size with minimum constraints
      if (newWidth > 200) { // Minimum width
        element.style.width = newWidth + 'px';
      }

      if (newHeight > 100) { // Minimum height
        contentElement.style.height = newHeight + 'px';

        // Update the list and detail view heights
        const listView = doc.getElementById('contract-list');
        const detailView = doc.getElementById('contract-detail');

        if (listView && detailView) {
          listView.style.maxHeight = (newHeight - 10) + 'px'; // Subtract padding
          detailView.style.maxHeight = (newHeight - 10) + 'px'; // Subtract padding
        }
      }
    }

    function stopResize() {
      // Stop resizing
      doc.onmouseup = null;
      doc.onmousemove = null;
    }
  }

  // Function to scan all servers in the network
  function scanAllServers(ns) {
    const visited = new Set(['home']);
    const stack = ['home'];
    const allServers = [];

    while (stack.length > 0) {
      const server = stack.pop();
      allServers.push(server);

      const connections = ns.scan(server);
      for (const connection of connections) {
        if (!visited.has(connection)) {
          visited.add(connection);
          stack.push(connection);
        }
      }
    }

    return allServers;
  }

  // Make element draggable
  function makeElementDraggable(element, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    dragHandle.style.cursor = "move";

    dragHandle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // Get mouse position at startup
      pos3 = e.clientX;
      pos4 = e.clientY;
      doc.onmouseup = closeDragElement;
      // Call a function whenever the cursor moves
      doc.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // Calculate new position
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      // Set element's new position
      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";
      element.style.right = "auto";
    }

    function closeDragElement() {
      // Stop moving when mouse button is released
      doc.onmouseup = null;
      doc.onmousemove = null;
    }
  }

  // Function to copy text to clipboard
  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';  // Prevent scrolling to bottom
    document.body.appendChild(textarea);
    textarea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        return true;
      } else {
        return false;
      }
    } catch (err) {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  // Function to format contract data for display
  function formatData(data) {
    if (Array.isArray(data)) {
      return JSON.stringify(data);
    } else if (typeof data === 'object') {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  }

  // Function to find contract index by server and filename
  function findContractIndex(contracts, server, filename) {
    return contracts.findIndex(c =>
      c.server === server && c.filename === filename
    );
  }

  // Function to find contract index by server and filename
  function findContractIndex(contracts, server, filename) {
    return contracts.findIndex(c =>
      c.server === server && c.filename === filename
    );
  }

  // Function to get a unique key for a contract
  function getContractKey(server, filename) {
    return `${server}-${filename}`;
  }
  // Function to update the UI with contract data
  function updateUI(contracts, selectedIndex = -1) {
    const listView = doc.getElementById('contract-list');
    const detailView = doc.getElementById('contract-detail');

    if (!listView || !detailView) { return }

    // Clear list view
    listView.innerHTML = '';

    // Populate list view
    if (contracts.length === 0) {
      listView.innerHTML = '<div style="color: yellow;">No contracts found</div>';
      // Reset selection if no contracts available
      currentSelection = { server: null, filename: null, index: -1 };
    } else {
      contracts.forEach((contract, index) => {
        const item = doc.createElement('div');
        item.style.padding = '5px';
        item.style.marginBottom = '5px';
        item.style.backgroundColor = index === selectedIndex ? '#003300' : '#001100';
        item.style.border = '1px solid #003300';
        item.style.cursor = 'pointer';

        item.innerHTML = `
          <div style="color: white; font-weight: bold;">${contract.type}</div>
          <div style="font-size: 10px;">
            <span style="color: yellow;">${contract.server}</span>
            <span style="color: gray;"> / </span>
            <span style="color: cyan;">${contract.filename}</span>
          </div>
        `;

        item.onclick = () => {
          // Save any input from the current selection before switching
          const currentInput = doc.getElementById('solution-input');
          if (currentInput && currentSelection.server && currentSelection.filename) {
            const currentKey = getContractKey(currentSelection.server, currentSelection.filename);
            solutionInputs.set(currentKey, currentInput.value);
          }

          // Update selected contract
          currentSelection = {
            server: contract.server,
            filename: contract.filename,
            index: index
          };
          updateUI(contracts, index);
        };

        listView.appendChild(item);
      });
    }

    // Update detail view
    if (selectedIndex >= 0 && selectedIndex < contracts.length) {
      const contract = contracts[selectedIndex];
      const contractKey = getContractKey(contract.server, contract.filename);

      // Create the detail view content
      detailView.innerHTML = `
        <h3 style="margin-top: 0; color: white;">${contract.type}</h3>
        
        <div style="margin-bottom: 5px;">
          <span style="color: gray;">Server: </span>
          <span style="color: yellow;">${contract.server}</span>
        </div>
        
        <div style="margin-bottom: 5px;">
          <span style="color: gray;">File: </span>
          <span style="color: cyan;">${contract.filename}</span>
        </div>
        
        <div style="margin-bottom: 5px;">
          <span style="color: gray;">Tries remaining: </span>
          <span style="color: red;">${contract.tries}</span>
        </div>
        
        <div style="margin-bottom: 10px;">
          <span style="color: gray;">Description: </span>
          <button id="copy-desc-btn" style="
            background-color: #003300;
            color: rgb(0, 204, 0);
            border: 1px solid rgb(0, 204, 0);
            padding: 2px 5px;
            margin-left: 5px;
            cursor: pointer;
            font-size: 12px;
          ">Copy to Clipboard</button>
          <div id="description-text" style="
            background-color: #002200; 
            padding: 5px; 
            margin-top: 5px; 
            white-space: pre-wrap; 
            overflow-x: auto;
          ">${contract.description}</div>
        </div>
        
        <div style="margin-bottom: 5px;">
          <span style="color: gray;">Submit solution: </span>
        </div>
        <div style="
          display: flex;
          flex-direction: column;
          background-color: #002200;
          padding: 10px;
          margin-top: 5px;
          border: 1px solid #003300;
        ">
          <textarea id="solution-input" style="
            background-color: #001100;
            color: white;
            border: 1px solid #004400;
            padding: 5px;
            margin-bottom: 5px;
            min-height: 100px;
            font-family: monospace;
          " placeholder="Enter your solution here..."></textarea>
          <button id="submit-solution-btn" style="
            background-color: #003300;
            color: rgb(0, 204, 0);
            border: 1px solid rgb(0, 204, 0);
            padding: 5px;
            cursor: pointer;
            align-self: flex-end;
          ">Submit Solution</button>
        </div>
      `;

      // Restore the saved input value if it exists
      const solutionInput = doc.getElementById('solution-input');
      if (solutionInput && solutionInputs.has(contractKey)) {
        solutionInput.value = solutionInputs.get(contractKey);
      }

      // Add event listeners to the new buttons
      const copyDescBtn = doc.getElementById('copy-desc-btn');
      if (copyDescBtn) {
        copyDescBtn.onclick = () => {
          const descText = contract.description;
          const success = copyToClipboard(descText);
          if (success) {
            copyDescBtn.innerText = "Copied!";
            setTimeout(() => {
              copyDescBtn.innerText = "Copy to Clipboard";
            }, 2000);
          } else {
            copyDescBtn.innerText = "Failed to copy";
            setTimeout(() => {
              copyDescBtn.innerText = "Copy to Clipboard";
            }, 2000);
          }
        };
      }

      const submitSolutionBtn = doc.getElementById('submit-solution-btn');
      if (submitSolutionBtn) {
        submitSolutionBtn.onclick = () => {
          const solutionInput = doc.getElementById('solution-input');
          if (solutionInput && solutionInput.value.trim() !== "") {
            // Get the solution value
            const solution = solutionInput.value.trim();

            // Attempt to submit the solution
            try {
              const result = ns.codingcontract.attempt(solution, contract.filename, contract.server, { returnReward: true });

              if (result) {
                // Success, show the reward
                ns.alert(`Success! Reward: ${result}`);

                // Clear the input field and saved value
                solutionInput.value = "";
                solutionInputs.delete(contractKey);

                // Refresh the contracts data
                refreshContractData();
              } else {
                // Failure
                ns.alert("Incorrect solution. Try again!");

                // Save the current input before refreshing
                solutionInputs.set(contractKey, solutionInput.value);

                // Refresh to update the tries counter
                refreshContractData();
              }
            } catch (error) {
              // Handle any errors
              ns.alert(`Error submitting solution: ${error}`);
            }
          } else {
            ns.alert("Please enter a solution before submitting.");
          }
        };
      }
    } else {
      detailView.innerHTML = '<div style="color: gray; font-style: italic;">Select a contract to view details</div>';
    }
  }

  // Function to refresh contract data
  async function refreshContractData() {
    const status = doc.getElementById('contract-status');
    if (!status) { return };

    status.innerText = "Scanning network for contracts...";

    // Save the current input value before refreshing
    const currentInput = doc.getElementById('solution-input');
    if (currentInput && currentSelection.server && currentSelection.filename) {
      const currentKey = getContractKey(currentSelection.server, currentSelection.filename);
      solutionInputs.set(currentKey, currentInput.value);
    }

    const servers = scanAllServers(ns);
    const contractData = [];

    // Find all contracts
    for (const server of servers) {
      const contracts = ns.ls(server, ".cct");

      if (contracts.length > 0) {
        for (const contract of contracts) {
          const type = ns.codingcontract.getContractType(contract, server);
          const description = ns.codingcontract.getDescription(contract, server);
          const tries = ns.codingcontract.getNumTriesRemaining(contract, server);

          contractData.push({
            server,
            filename: contract,
            type,
            description,
            tries,
          });
        }
      }
    }

    // Find the previously selected contract in the new data
    let newSelectedIndex = -1;

    if (currentSelection.server && currentSelection.filename) {
      newSelectedIndex = findContractIndex(
        contractData,
        currentSelection.server,
        currentSelection.filename
      );
    }

    // If we couldn't find the exact contract, keep the current index if valid
    if (newSelectedIndex === -1 && currentSelection.index >= 0 && currentSelection.index < contractData.length) {
      newSelectedIndex = currentSelection.index;
    }

    // Update UI with new data and preserved selection
    updateUI(contractData, newSelectedIndex);

    // Set new status
    status.innerText = `${contractData.length} contracts. Updated: ${new Date().toLocaleTimeString('et')}`;

    // Update current selection with new index if found
    if (newSelectedIndex !== -1) {
      currentSelection.index = newSelectedIndex;
    }

    return contractData;
  }

  // Initial data load
  await refreshContractData();

  ns.atExit(() => contractUI.remove())

  toggleMinimize()

  // Main loop
  while (true) {
    await ns.asleep(10000);

    await refreshContractData();
  }
}