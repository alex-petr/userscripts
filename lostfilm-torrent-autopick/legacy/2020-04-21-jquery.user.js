// ==UserScript==
// @name         Lostfilm.tv > Save & run [1080p] torrent
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        *.retre.org/*
// @match        *.insearch.site/*
// @grant        none
// ==/UserScript==

// @3require2      https://code.jquery.com/jquery-3.4.1.min.js

(function() {
    'use strict';

    var save_torrent_link = '', save_torrent_link_text = '',
        save_torrent_link_alternative = '', save_torrent_link_alternative_text = '';

    $('.inner-box--list .inner-box--item .inner-box--link.main a').each(function() {
        var current_save_torrent_link_text = $(this).text();

        if (/1080/i.test(current_save_torrent_link_text)) {
            save_torrent_link = $(this).attr('href');
            save_torrent_link_text = current_save_torrent_link_text;
        } else if (/720/i.test(current_save_torrent_link_text) && save_torrent_link == '') {
            save_torrent_link = $(this).attr('href');
            save_torrent_link_text = current_save_torrent_link_text;
        } else if (save_torrent_link_alternative == '') {
            save_torrent_link_alternative = $(this).attr('href');
            save_torrent_link_alternative_text = current_save_torrent_link_text;
        }
    });

    if (save_torrent_link != '') {
        // alert( '1080p or 720p: ' + save_torrent_link + ' | ' + save_torrent_link_text );
        // alert( 'Alternative: ' + save_torrent_link_alternative + ' | ' + save_torrent_link_alternative_text );
        document.location = save_torrent_link;
    } else if (save_torrent_link == '' && save_torrent_link_alternative != '') {
        alert( '[WARNING] 1080p or 720p not found, saving alternative: ' + save_torrent_link_alternative + ' | ' + save_torrent_link_alternative_text );
        document.location = save_torrent_link_alternative;
    } else {
        alert( '[FATAL ERROR] 1080p or 720p or alternative format not found, terminating');
    };

    window.setTimeout( function (){ window.close(); }, 1500 );

    // $( document ).ready(function() { window.close(); });
    // $( window ).on( "load", function() { window.close(); });
    // $('body').addClass('foo').delay(5000);
})();
