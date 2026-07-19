const navigationButtons =
    document.querySelectorAll(".nav-button");

const workspaces =
    document.querySelectorAll(".workspace");

const workspaceTitle =
    document.getElementById("workspace-title");

const workspaceEyebrow =
    document.getElementById("workspace-eyebrow");

const proposalForm =
    document.getElementById("proposal-form");

const serviceSelect =
    document.getElementById("service");

const customServiceGroup =
    document.getElementById("custom-service-group");

const customServiceInput =
    document.getElementById("custom-service");

const proposalStatus =
    document.getElementById("proposal-status");

const proposalDetails =
    document.getElementById("proposal-details");

const proposalOutput =
    document.getElementById("proposal-output");

const proposalButton =
    document.getElementById("generate-proposal");

const copyProposalButton =
    document.getElementById("copy-proposal");

const refreshProposalsButton =
    document.getElementById("refresh-proposals");

const savedProposalsElement =
    document.getElementById("saved-proposals");

const clientForm =
    document.getElementById("client-form");

const clientStatus =
    document.getElementById("client-status");

const clientList =
    document.getElementById("client-list");

const refreshClientsButton =
    document.getElementById("refresh-clients");

const clientWorkspaceCard =
    document.getElementById("client-workspace-card");

const clientWorkspaceName =
    document.getElementById("client-workspace-name");

const clientOverview =
    document.getElementById("client-overview");

const clientProposalList =
    document.getElementById("client-proposal-list");

const clientWorkspaceNewProposal =
    document.getElementById("client-workspace-new-proposal");

const aiButton =
    document.getElementById("generate");

const aiResponse =
    document.getElementById("response");

const dashboardClientCount =
    document.getElementById("dashboard-client-count");

const dashboardProposalCount =
    document.getElementById("dashboard-proposal-count");

const dashboardDraftCount =
    document.getElementById("dashboard-draft-count");

const dashboardRecentProposals =
    document.getElementById("dashboard-recent-proposals");

const workspaceNames = {
    "dashboard-workspace": {
        title: "Dashboard",
        eyebrow: "Command Center",
    },

    "clients-workspace": {
        title: "Clients",
        eyebrow: "Relationship Management",
    },

    "proposals-workspace": {
        title: "Proposals",
        eyebrow: "Client Delivery",
    },

    "projects-workspace": {
        title: "Projects",
        eyebrow: "Delivery Management",
    },

    "ai-workspace": {
        title: "AI Workspace",
        eyebrow: "Faith Harbor Intelligence",
    },

    "reports-workspace": {
        title: "Reports",
        eyebrow: "Business Intelligence",
    },

    "settings-workspace": {
        title: "Settings",
        eyebrow: "Administration",
    },
};

navigationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        openWorkspace(
            button.dataset.workspace,
        );
    });
});

document
    .getElementById("dashboard-new-proposal")
    .addEventListener("click", () => {
        openWorkspace("proposals-workspace");
    });

document
    .getElementById("dashboard-view-proposals")
    .addEventListener("click", () => {
        openWorkspace("proposals-workspace");
    });

document
    .getElementById("dashboard-add-client")
    .addEventListener("click", () => {
        openWorkspace("clients-workspace");

        document
            .getElementById("client-company-name")
            .focus();
    });

document
    .getElementById("dashboard-open-ai")
    .addEventListener("click", () => {
        openWorkspace("ai-workspace");
    });

document
    .getElementById("dashboard-open-clients")
    .addEventListener("click", () => {
        openWorkspace("clients-workspace");
    });

serviceSelect.addEventListener("change", () => {
    const isCustom =
        serviceSelect.value === "Custom Service";

    customServiceGroup.classList.toggle(
        "hidden",
        !isCustom,
    );

    customServiceInput.required = isCustom;

    if (!isCustom) {
        customServiceInput.value = "";
    }

    const requestedOutcome =
        document.getElementById(
            "requested-outcome",
        );

    if (
        serviceSelect.value &&
        !requestedOutcome.value.trim()
    ) {
        requestedOutcome.value =
            `Prepare a ${serviceSelect.value} proposal`;
    }
});

proposalForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        const selectedService =
            serviceSelect.value === "Custom Service"
                ? customServiceInput.value.trim()
                : serviceSelect.value;

        const clientName =
            document
                .getElementById("client-name")
                .value
                .trim();

        const requestedOutcome =
            document
                .getElementById("requested-outcome")
                .value
                .trim();

        const requirements =
            document
                .getElementById("requirements")
                .value
                .trim();

        const dueDate =
            document
                .getElementById("due-date")
                .value;

        const additionalNotes =
            document
                .getElementById("additional-notes")
                .value
                .trim();

        if (
            !selectedService ||
            !clientName ||
            !requestedOutcome ||
            !requirements
        ) {
            showProposalStatus(
                "Please complete all required fields.",
                "error",
            );

            return;
        }

        proposalButton.disabled = true;
        copyProposalButton.disabled = true;

        proposalButton.textContent =
            "Generating Proposal...";

        showProposalStatus(
            "Faith Harbor OS is preparing and saving the proposal. Local AI generation may take a minute.",
            "working",
        );

        proposalDetails.classList.add("hidden");
        proposalOutput.textContent = "";

        try {
            const response = await fetch(
                "/api/v1/proposals",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        clientName,
                        requestedOutcome,
                        requirements,

                        dueDate:
                            dueDate || undefined,

                        metadata: {
                            service:
                                selectedService,

                            additionalNotes:
                                additionalNotes ||
                                undefined,
                        },
                    }),
                },
            );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error?.message ||
                    "Proposal generation failed.",
                );
            }

            displayProposal(
                result.proposal,
            );

            showProposalStatus(
                "Proposal draft generated and saved. Review and approve it before sending it to the client.",
                "success",
            );

            await refreshApplicationData();
        } catch (error) {
            showProposalStatus(
                getErrorMessage(
                    error,
                    "Proposal generation failed.",
                ),
                "error",
            );
        } finally {
            proposalButton.disabled = false;

            proposalButton.textContent =
                "Generate Proposal";
        }
    },
);

copyProposalButton.addEventListener(
    "click",
    async () => {
        const proposal =
            proposalOutput.textContent.trim();

        if (!proposal) {
            return;
        }

        try {
            await navigator.clipboard.writeText(
                proposal,
            );

            copyProposalButton.textContent =
                "Copied";

            setTimeout(() => {
                copyProposalButton.textContent =
                    "Copy";
            }, 1500);
        } catch {
            showProposalStatus(
                "The proposal could not be copied automatically.",
                "error",
            );
        }
    },
);

refreshProposalsButton.addEventListener(
    "click",
    loadSavedProposals,
);

clientForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        const payload = {
            companyName:
                document
                    .getElementById(
                        "client-company-name",
                    )
                    .value
                    .trim(),

            primaryContact:
                document
                    .getElementById(
                        "client-primary-contact",
                    )
                    .value
                    .trim(),

            email:
                optionalValue(
                    "client-email",
                ),

            phone:
                optionalValue(
                    "client-phone",
                ),

            website:
                optionalValue(
                    "client-website",
                ),

            industry:
                optionalValue(
                    "client-industry",
                ),

            notes:
                optionalValue(
                    "client-notes",
                ),
        };

        showClientStatus(
            "Creating client...",
            "working",
        );

        try {
            const response = await fetch(
                "/api/v1/clients",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify(
                        payload,
                    ),
                },
            );

            const client =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    client.error?.message ||
                    "Client creation failed.",
                );
            }

            clientForm.reset();

            showClientStatus(
                "Client created successfully.",
                "success",
            );

            await refreshApplicationData();

            await openClientWorkspace(
                client.id,
            );
        } catch (error) {
            showClientStatus(
                getErrorMessage(
                    error,
                    "Client creation failed.",
                ),
                "error",
            );
        }
    },
);

refreshClientsButton.addEventListener(
    "click",
    loadClients,
);

clientWorkspaceNewProposal.addEventListener(
    "click",
    () => {
        const companyName =
            clientWorkspaceName.textContent.trim();

        document.getElementById(
            "client-name",
        ).value = companyName;

        openWorkspace(
            "proposals-workspace",
        );
    },
);

aiButton.addEventListener(
    "click",
    async () => {
        const provider =
            document
                .getElementById("provider")
                .value;

        const prompt =
            document
                .getElementById("prompt")
                .value
                .trim();

        if (!prompt) {
            aiResponse.textContent =
                "Please enter a prompt.";

            return;
        }

        aiButton.disabled = true;
        aiButton.textContent =
            "Generating...";

        aiResponse.textContent =
            "Connecting to Faith Harbor OS...";

        try {
            const response = await fetch(
                "/api/v1/ai/chat",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        provider,
                        prompt,
                    }),
                },
            );

            const result =
                await response.json();

            aiResponse.textContent =
                JSON.stringify(
                    result,
                    null,
                    2,
                );
        } catch (error) {
            aiResponse.textContent =
                `Connection failed.\n\n${getErrorMessage(
                    error,
                    "Unknown error",
                )}`;
        } finally {
            aiButton.disabled = false;
            aiButton.textContent =
                "Generate";
        }
    },
);

function openWorkspace(workspaceId) {
    navigationButtons.forEach((button) => {
        button.classList.toggle(
            "active",
            button.dataset.workspace ===
                workspaceId,
        );
    });

    workspaces.forEach((workspace) => {
        workspace.classList.toggle(
            "active",
            workspace.id ===
                workspaceId,
        );
    });

    const workspace =
        workspaceNames[workspaceId];

    if (workspace) {
        workspaceTitle.textContent =
            workspace.title;

        workspaceEyebrow.textContent =
            workspace.eyebrow;
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth",
    });
}

function showProposalStatus(
    message,
    statusType,
) {
    proposalStatus.textContent =
        message;

    proposalStatus.className =
        `status-message ${statusType}`;
}

function showClientStatus(
    message,
    statusType,
) {
    clientStatus.textContent =
        message;

    clientStatus.className =
        `status-message ${statusType}`;
}

function displayProposal(proposal) {
    proposalOutput.textContent =
        proposal.proposal;

    proposalDetails.textContent =
        [
            `Client: ${proposal.clientName}`,
            `Service: ${proposal.service}`,
            `Status: ${proposal.status}`,
            `Proposal ID: ${proposal.id}`,
            `Created: ${formatDate(proposal.createdAt)}`,
        ].join("\n");

    proposalDetails.className =
        "status-message";

    copyProposalButton.disabled = false;
}

async function loadSavedProposals() {
    savedProposalsElement.textContent =
        "Loading saved proposals...";

    try {
        const response = await fetch(
            "/api/v1/proposals",
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error?.message ||
                "Saved proposals could not be loaded.",
            );
        }

        renderProposalList(
            savedProposalsElement,
            result.proposals,
            true,
        );

        updateProposalMetrics(
            result.proposals,
        );

        renderDashboardProposals(
            result.proposals,
        );
    } catch (error) {
        savedProposalsElement.textContent =
            getErrorMessage(
                error,
                "Saved proposals could not be loaded.",
            );
    }
}

async function loadClients() {
    clientList.textContent =
        "Loading clients...";

    try {
        const response = await fetch(
            "/api/v1/clients",
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error?.message ||
                "Clients could not be loaded.",
            );
        }

        dashboardClientCount.textContent =
            String(result.count);

        renderClients(
            result.clients,
        );
    } catch (error) {
        clientList.textContent =
            getErrorMessage(
                error,
                "Clients could not be loaded.",
            );
    }
}

function renderClients(clients) {
    clientList.replaceChildren();

    if (clients.length === 0) {
        clientList.textContent =
            "No clients have been created yet.";

        return;
    }

    clients.forEach((client) => {
        const button =
            createRecordButton(
                client.companyName,

                [
                    client.primaryContact,
                    client.industry,
                    formatDate(
                        client.createdAt,
                    ),
                ]
                    .filter(Boolean)
                    .join(" • "),
            );

        button.addEventListener(
            "click",
            () => {
                openClientWorkspace(
                    client.id,
                );
            },
        );

        clientList.appendChild(
            button,
        );
    });
}

async function openClientWorkspace(
    clientId,
) {
    try {
        const response = await fetch(
            `/api/v1/clients/${clientId}/workspace`,
        );

        const workspace =
            await response.json();

        if (!response.ok) {
            throw new Error(
                workspace.error?.message ||
                "Client workspace could not be opened.",
            );
        }

        const client =
            workspace.client;

        clientWorkspaceName.textContent =
            client.companyName;

        clientOverview.replaceChildren();

        const details = [
            [
                "Primary Contact",
                client.primaryContact,
            ],

            [
                "Email",
                client.email ||
                    "Not provided",
            ],

            [
                "Phone",
                client.phone ||
                    "Not provided",
            ],

            [
                "Website",
                client.website ||
                    "Not provided",
            ],

            [
                "Industry",
                client.industry ||
                    "Not provided",
            ],

            [
                "Created",
                formatDate(
                    client.createdAt,
                ),
            ],
        ];

        details.forEach(
            ([label, value]) => {
                const item =
                    document.createElement(
                        "div",
                    );

                item.className =
                    "client-overview-item";

                const labelElement =
                    document.createElement(
                        "span",
                    );

                labelElement.textContent =
                    label;

                const valueElement =
                    document.createElement(
                        "strong",
                    );

                valueElement.textContent =
                    value;

                item.append(
                    labelElement,
                    valueElement,
                );

                clientOverview.appendChild(
                    item,
                );
            },
        );

        renderProposalList(
            clientProposalList,
            workspace.proposals,
            false,
        );

        clientWorkspaceCard.classList.remove(
            "hidden",
        );
    } catch (error) {
        showClientStatus(
            getErrorMessage(
                error,
                "Client workspace could not be opened.",
            ),
            "error",
        );
    }
}

function renderProposalList(
    container,
    proposals,
    showClientName,
) {
    container.replaceChildren();

    if (proposals.length === 0) {
        container.textContent =
            "No proposals have been saved yet.";

        return;
    }

    proposals.forEach((proposal) => {
        const title =
            showClientName
                ? `${proposal.clientName} - ${proposal.service}`
                : proposal.service;

        const detail =
            `${proposal.status} • ${formatDate(
                proposal.createdAt,
            )}`;

        const button =
            createRecordButton(
                title,
                detail,
            );

        button.addEventListener(
            "click",
            async () => {
                await openSavedProposal(
                    proposal.id,
                );
            },
        );

        container.appendChild(
            button,
        );
    });
}

function renderDashboardProposals(
    proposals,
) {
    const recent =
        proposals.slice(0, 5);

    renderProposalList(
        dashboardRecentProposals,
        recent,
        true,
    );
}

function updateProposalMetrics(
    proposals,
) {
    dashboardProposalCount.textContent =
        String(proposals.length);

    const draftCount =
        proposals.filter(
            (proposal) =>
                proposal.status === "draft",
        ).length;

    dashboardDraftCount.textContent =
        String(draftCount);
}

async function openSavedProposal(
    proposalId,
) {
    try {
        const response = await fetch(
            `/api/v1/proposals/${proposalId}`,
        );

        const proposal =
            await response.json();

        if (!response.ok) {
            throw new Error(
                proposal.error?.message ||
                "The proposal could not be opened.",
            );
        }

        displayProposal(proposal);

        showProposalStatus(
            "Saved proposal opened.",
            "success",
        );

        openWorkspace(
            "proposals-workspace",
        );
    } catch (error) {
        showProposalStatus(
            getErrorMessage(
                error,
                "The proposal could not be opened.",
            ),
            "error",
        );
    }
}

function createRecordButton(
    title,
    detail,
) {
    const button =
        document.createElement("button");

    button.type = "button";
    button.className =
        "record-button";

    const titleElement =
        document.createElement("span");

    titleElement.className =
        "record-title";

    titleElement.textContent =
        title;

    const detailElement =
        document.createElement("span");

    detailElement.className =
        "record-detail";

    detailElement.textContent =
        detail;

    button.append(
        titleElement,
        detailElement,
    );

    return button;
}

function optionalValue(elementId) {
    const value =
        document
            .getElementById(elementId)
            .value
            .trim();

    return value || undefined;
}

function formatDate(value) {
    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime(),
        )
    ) {
        return value;
    }

    return date.toLocaleString();
}

function getErrorMessage(
    error,
    fallback,
) {
    return error instanceof Error
        ? error.message
        : fallback;
}

async function refreshApplicationData() {
    await Promise.all([
        loadSavedProposals(),
        loadClients(),
    ]);
}

refreshApplicationData();