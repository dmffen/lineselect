#!/bin/sh
set -o errexit

{
	sed -E '\|^// ==/UserScript==|q' bidsummarize.user.js ;
	echo "// AUTO-GENERATED, do not edit" ;
} >bidsummarize.meta.js
touch -r bidsummarize.user.js bidsummarize.meta.js
