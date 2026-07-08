(function () {
    var supportUrl = "https://mcortesgranados.github.io/PETICIONES-SANTO-ROSARIO.html";
    var supportPath = "/PETICIONES-SANTO-ROSARIO.html";

    function isEnglishPage() {
        var lang = ((document.documentElement && document.documentElement.lang) || "").toLowerCase();
        return lang.indexOf("en") === 0;
    }

    function isSupportDocumentPage() {
        var path = (window.location && window.location.pathname) || "";
        var lowerPath = path.toLowerCase();
        return lowerPath.indexOf("peticiones-santo-rosario.html") >= 0;
    }

    function buildContent() {
        var english = isEnglishPage();
        var samePage = isSupportDocumentPage();

        if (english && samePage) {
            return {
                eyebrow: "Support our oversight work",
                title: "Support our oversight work by sharing this document.",
                copy: "Use this page to help promote peace in the world and justice through reflection, prayer, and civic awareness.",
                cta: "Open support document",
                urlLabel: "Support document:"
            };
        }

        if (english) {
            return {
                eyebrow: "Support our oversight work",
                title: "Support our oversight work by downloading this document.",
                copy: "Please read and share this resource to help promote peace in the world and justice.",
                cta: "Open support document",
                urlLabel: "Support document:"
            };
        }

        if (samePage) {
            return {
                eyebrow: "Apoya nuestra Veeduria",
                title: "Apoya nuestra Veeduria compartiendo este documento.",
                copy: "Usa esta pagina para promover la paz del mundo y la justicia por medio de la reflexion, la oracion y la conciencia ciudadana.",
                cta: "Abrir documento de apoyo",
                urlLabel: "Documento de apoyo:"
            };
        }

        return {
            eyebrow: "Apoya nuestra Veeduria",
            title: "Apoya nuestra Veeduria descargando este documento.",
            copy: "Te invitamos a leer y compartir este recurso para ayudar a promover la paz del mundo y la justicia.",
            cta: "Abrir documento de apoyo",
            urlLabel: "Documento de apoyo:"
        };
    }

    function createBanner(compact) {
        var content = buildContent();
        var section = document.createElement("section");
        section.className = "veeduria-support-banner";
        section.setAttribute("data-veeduria-support-banner", "true");
        if (compact) {
            section.setAttribute("data-compact", "true");
        }

        section.innerHTML =
            '<p class="veeduria-support-banner__eyebrow">' + content.eyebrow + '</p>' +
            '<h2 class="veeduria-support-banner__title">' + content.title + "</h2>" +
            '<p class="veeduria-support-banner__copy">' + content.copy + "</p>" +
            '<div class="veeduria-support-banner__actions">' +
            '<a class="veeduria-support-banner__link" href="' + supportUrl + '" target="_blank" rel="noopener">' + content.cta + "</a>" +
            '<p class="veeduria-support-banner__url">' + content.urlLabel + ' <a href="' + supportUrl + '" target="_blank" rel="noopener">' + supportPath + "</a></p>" +
            "</div>";

        return section;
    }

    function insertBanner() {
        if (!document.body || document.querySelector("[data-veeduria-support-banner='true']")) {
            return;
        }

        var slot = document.querySelector("[data-veeduria-support-slot]");
        if (slot) {
            slot.appendChild(createBanner(true));
            return;
        }

        var main = document.querySelector("main");
        var body = document.body;
        var banner = createBanner(false);

        if (main && main.firstChild) {
            main.insertBefore(banner, main.firstChild);
            return;
        }

        if (body.firstChild) {
            body.insertBefore(banner, body.firstChild);
            return;
        }

        body.appendChild(banner);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", insertBanner);
    } else {
        insertBanner();
    }
}());
