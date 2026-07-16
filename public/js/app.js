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

const aiButton =
    document.getElementById("generate");

const aiResponse =
    document.getElementById("response");

const tabButtons =
    document.querySelectorAll(".tab-button");

const tabPanels =
    document.querySelectorAll(".tab-panel");

tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
        tabButtons.forEach((item) => {
            item.classList.remove("active");
        });

        tabPanels.forEach((panel) => {
            panel.classList.remove("active");
        });

        button.classList.add("active");

        document
            .getElementById(button.dataset.panel)
            .classList.add("active");
    });
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

    const outcomeInput =
        document.getElementById("requested-outcome");

    if (
        serviceSelect.value &&
        !outcomeInput.value.trim()
    ) {
        outcomeInput.value =
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

            const savedProposal =
                result.proposal;

            displayProposal(savedProposal);

            showProposalStatus(
                "Proposal draft generated and saved. Review and approve it before sending it to the client.",
                "success",
            );

            copyProposalButton.disabled = false;

            await loadSavedProposals();
        } catch (error) {
            showProposalStatus(
                error instanceof Error
                    ? error.message
                    : "Proposal generation failed.",
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
                `Connection failed.\n\n${error}`;
        } finally {
            aiButton.disabled = false;
            aiButton.textContent =
                "Generate";
        }
    },
);

function showProposalStatus(
    message,
    statusType,
) {
    proposalStatus.textContent = message;

    proposalStatus.className =
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

    window.scrollTo({
        top: proposalOutput.offsetTop - 100,
        behavior: "smooth",
    });
}

async function loadSavedProposals() {
    savedProposalsElement.textContent =
        "Loading saved proposals...";

    refreshProposalsButton.disabled = true;

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

        renderSavedProposals(
            result.proposals,
        );
    } catch (error) {
        savedProposalsElement.textContent =
            error instanceof Error
                ? error.message
                : "Saved proposals could not be loaded.";
    } finally {
        refreshProposalsButton.disabled = false;
    }
}

function renderSavedProposals(proposals) {
    savedProposalsElement.replaceChildren();

    if (proposals.length === 0) {
        savedProposalsElement.textContent =
            "No proposals have been saved yet.";

        return;
    }

    const newestFirst =
        [...proposals].sort(
            (left, right) =>
                new Date(right.createdAt) -
                new Date(left.createdAt),
        );

    newestFirst.forEach((proposal) => {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className =
            "secondary-button";

        button.textContent =
            `${proposal.clientName} — ${proposal.service} — ${proposal.status}`;

        button.addEventListener(
            "click",
            async () => {
                await openSavedProposal(
                    proposal.id,
                );
            },
        );

        savedProposalsElement.appendChild(
            button,
        );
    });
}

async function openSavedProposal(proposalId) {
    showProposalStatus(
        "Opening saved proposal...",
        "working",
    );

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
    } catch (error) {
        showProposalStatus(
            error instanceof Error
                ? error.message
                : "The proposal could not be opened.",
            "error",
        );
    }
}

function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

loadSavedProposals();