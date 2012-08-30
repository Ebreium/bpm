// ==UserScript==
// @include http://*.reddit.com/*
// @include https://*.reddit.com/*
// ==/UserScript==

/*
 * THIS FILE IS NOT A USERSCRIPT. DO NOT ATTEMPT TO INSTALL IT AS SUCH.
 *
 * The above header is used by Opera.
 */

/*******************************************************************************
**
** Copyright (C) 2012 Typhos
**
** This Source Code Form is subject to the terms of the Mozilla Public
** License, v. 2.0. If a copy of the MPL was not distributed with this
** file, You can obtain one at http://mozilla.org/MPL/2.0/.
**
*******************************************************************************/

// Embed emote-map.js, for Opera
/*$(EMOTE_MAP)*/
/*$(SR_DATA)*/

(function(global) {
    "use strict";

    function current_platform() {
        if(typeof(self.on) !== "undefined") {
            return "firefox";
        } else if(typeof(chrome) !== "undefined") {
            return "chrome";
        } else if(typeof(opera) !== "undefined") {
            return "opera";
        } else {
            return "unknown";
        }
    }
    var platform = current_platform();

    var browser;
    switch(platform) {
        case "firefox":
            browser = {
                _pref_cache: null,
                _pref_callbacks: [],

                getPrefs: function(callback) {
                    if(this._pref_cache) {
                        callback(this._pref_cache);
                    } else {
                        this._pref_callbacks.push(callback);
                    }
                },

                applyCSS: function(filename) {
                    // Do nothing (handled in main.js)
                }
            };

            self.port.on("prefs", function(prefs) {
                browser._pref_cache = prefs;
                browser._pref_callbacks.forEach(function(callback) {
                    callback(browser._pref_cache);
                });
                browser._pref_callbacks = [];
            });

            self.port.emit("getPrefs");
            break;

        case "chrome":
            browser = {
                _pref_cache: null,
                _pref_callbacks: [],

                getPrefs: function(callback) {
                    if(this._pref_cache) {
                        callback(this._pref_cache);
                    } else {
                        this._pref_callbacks.push(callback);
                    }
                },

                applyCSS: function(filename) {
                    var tag = document.createElement("link");
                    tag.href =  chrome.extension.getURL(filename);
                    tag.rel = "stylesheet";
                    document.documentElement.insertBefore(tag);
                }
            };

            chrome.extension.sendMessage({method: "getPrefs"}, function(prefs) {
                browser._pref_cache = prefs;
                browser._pref_callbacks.forEach(function(callback) {
                    callback(browser._pref_cache);
                });
                browser._pref_callbacks = [];
            });
            break;

        case "opera":
            if(opera.extension.getFile) {
                var is_opera_next = true; // Close enough!
                /* Opera Next (12.50) has getFile(), which we prefer */
                var getFile = function(filename, callback) {
                    var file = opera.extension.getFile(filename);
                    if(file) {
                        var reader = new FileReader();
                        reader.onload = function() {
                            callback(reader.result);
                        };
                        reader.readAsText(file);
                    } else {
                        console.log("BPM: ERROR: getFile() failed on '" + filename + "'");
                    }
                };
            } else {
                var file_callbacks = {};

                var getFile = function(filename, callback) {
                    file_callbacks[filename] = callback;
                    opera.extension.postMessage({
                        "request": "getFile",
                        "filename": filename
                    });
                };
            }

            browser = {
                _pref_cache: null,
                _pref_callbacks: [],

                getPrefs: function(callback) {
                    if(this._pref_cache) {
                        callback(this._pref_cache);
                    } else {
                        this._pref_callbacks.push(callback);
                    }
                },

                applyCSS: function(filename) {
                    getFile(filename, function(data) {
                        var tag = document.createElement("style");
                        tag.setAttribute("type", "text/css");
                        tag.appendChild(document.createTextNode(data));
                        document.head.insertBefore(tag, document.head.firstChild);
                    });
                }
            };

            opera.extension.addEventListener("message", function(event) {
                var message = event.data;
                switch(message.request) {
                    case "fileLoaded":
                        // Better hope the code's correct and this doesn't fire
                        // when we aren't expecting it.
                        file_callbacks[message.filename](message.data);
                        delete file_callbacks[message.filename];
                        break;

                    case "prefs":
                        browser._pref_cache = message.prefs;
                        browser._pref_callbacks.forEach(function(callback) {
                            callback(browser._pref_cache);
                        });
                        browser._pref_callbacks = [];
                        break;

                    default:
                        console.log("ERROR: Unknown request from background script: " + message.request);
                        break;
                }
            }, false);

            opera.extension.postMessage({
                "request": "getPrefs"
            });
            break;
    }

    function sanitize(s) {
        return s.toLowerCase().replace("!", "_excl_").replace(":", "_colon_");
    }

    function process(prefs, sr_array, elements) {
        for(var i = 0; i < elements.length; i++) {
            var element = elements[i];
            // Distinction between element.href and element.getAttribute("href")-
            // the former is normalized somewhat to be a complete URL, which we
            // don't want.
            var href = element.getAttribute("href");
            if(href && href[0] == '/') {
                // Don't normalize case for emote lookup
                var parts = href.split("-");
                var emote_name = parts[0];

                if(emote_map[emote_name]) {
                    var emote_info = emote_map[emote_name];
                    var is_nsfw = emote_info[0];
                    var source_id = emote_info[1];

                    if(!sr_array[source_id]) {
                        element.className += " bpm-disabled";
                        if(!element.textContent) {
                            // Our CSS will make any existing text pretty ugly,
                            // but what can you do.
                            element.textContent = "Disabled " + emote_name;
                        }
                        continue;
                    }

                    // But do normalize it when working out the CSS class. Also
                    // strip off leading "/".
                    if(!is_nsfw || prefs.enableNSFW) {
                        element.className += " bpmote-" + sanitize(emote_name.slice(1));
                    } else {
                        element.className += " bpm-nsfw";
                        if(!element.textContent) {
                            element.textContent = "NSFW " + emote_name;
                        }
                    }

                    // Apply flags in turn. We pick on the naming a bit to prevent
                    // spaces and such from slipping in.
                    for(var p = 1; p < parts.length; p++) {
                        // Normalize case
                        var flag = parts[p].toLowerCase();
                        if(/^[\w\!]+$/.test(flag)) {
                            element.className += " bpflag-" + sanitize(flag);
                        }
                    }
                } else if(!element.textContent && /^\/[\w\-:!]+$/.test(emote_name) && !element.clientWidth) {
                    /*
                     * If there's:
                     *    1) No text
                     *    2) href matches regexp (no slashes, mainly)
                     *    3) No size (missing bg image means it won't display)
                     *    4) No :after or :before tricks to display the image
                     *       (some subreddits do emotes with those selectors)
                     * Then it's probably an emote, but we don't know what it is.
                     */
                    var after = window.getComputedStyle(element, ":after").backgroundImage;
                    var before = window.getComputedStyle(element, ":before").backgroundImage;
                    // "" in Opera, "none" in Firefox and Chrome.
                    if((!after || after == "none") && (!before || before == "none")) {
                        // Unknown emote? Good enough
                        element.className += " bpm-unknown";
                        element.textContent = "Unknown emote " + emote_name;
                    }
                }
            }
        }
    }

    function make_sr_array(prefs) {
        var sr_array = [];
        for(var id in sr_id_map) {
            sr_array[id] = prefs.enabledSubreddits[sr_id_map[id]];
        }
        if(sr_array.indexOf(undefined) > -1) {
            console.log("BPM: ERROR: sr_enabled not filled");
        }
        return sr_array;
    }

    browser.applyCSS("/bpmotes.css");
    browser.applyCSS("/emote-classes.css");
    browser.applyCSS("/combiners.css");

    browser.getPrefs(function(prefs) {
        if(prefs.enableExtraCSS) {
            // TODO: The only reason we still keep extracss separate is because
            // we don't have a flag_map yet. Maybe this works better, though-
            // this file tends to take a surprisingly long time to add...
            if(platform === "opera" && is_opera_next) {
                browser.applyCSS("/extracss-next.css");
            } else {
                browser.applyCSS("/extracss.css");
            }
        }
    });

    window.addEventListener("DOMContentLoaded", function() {
        browser.getPrefs(function(prefs) {
            // TODO: process prefs
            var sr_array = make_sr_array(prefs);
            process(prefs, sr_array, document.getElementsByTagName("a"));

            switch(platform) {
                case "chrome":
                    // Fix for Chrome, which sometimes doesn't rerender unknown
                    // emote elements. The result is that until the element is
                    // "nudged" in some way- merely viewing it in the Console/
                    // Elements tabs will do- it won't display.
                    //
                    // RES seems to reliably set things off, but that won't
                    // always be installed. Perhaps some day we'll trigger it
                    // implicitly through other means and be able to get rid of
                    // this, but for now it seems not to matter.
                    var tag = document.createElement("style");
                    tag.setAttribute("type", "text/css");
                    document.head.appendChild(tag);

                    // Fallthrough

                case "firefox":
                    var observer = new MutationSummary({
                        callback: function(summaries) {
                            process(prefs, sr_array, summaries[0].added);
                        },
                        queries: [
                            {element: "a"}
                        ]});
                    break;

                case "opera":
                default:
                    document.body.addEventListener("DOMNodeInserted", function(event) {
                        var element = event.target;
                        if(element.getElementsByTagName) {
                            process(prefs, sr_array, element.getElementsByTagName("a"));
                        }
                    }, false);
                    break;
            }
        });
    }, false);
})(this);