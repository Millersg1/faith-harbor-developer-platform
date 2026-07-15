const button = document.getElementById("generate");

button.addEventListener("click", async () => {
    const provider =
        document.getElementById("provider").value;

    const prompt =
        document.getElementById("prompt").value.trim();

    const responseElement =
        document.getElementById("response");

    if (!prompt) {
        responseElement.textContent =
            "Please enter a prompt.";

        return;
    }

    responseElement.textContent =
        "Connecting to Faith Harbor OS...";

    try {

        const response = await fetch("/api/v1/ai/chat", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                provider,
                prompt
            })

        });

        const result = await response.json();

        responseElement.textContent =
JSON.stringify(result, null, 2);

    }
    catch (error) {

        responseElement.textContent =
`Connection failed.

${error}`;

    }

});