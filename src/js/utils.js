module.exports = {

    HTML: function (templateData) {
        let string = templateData[0];

        for (let i = 1; i < arguments.length; ++i) {
            let value = arguments[i];

            string += module.exports.escapeHTML(value);
            string += templateData[i];
        }

        return string;
    },

    escapeHTML: (html) => {
        return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },

    isScrollOnBottom: (element) => {
        return element.scrollHeight - element.scrollTop === element.clientHeight;
    }

}