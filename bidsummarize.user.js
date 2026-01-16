// ==UserScript==
// @name	bidsummarize
// @description	Analyze bid information to be more informative
// @version	1.0.0
// @match	https://flightops.inside.ups.com/Dotnet/CrewApps/Bidding/ViewBidSummary.aspx
// @grant	none
// @inject-into	content
// @downloadURL	https://raw.githubusercontent.com/dmffen/lineselect/refs/heads/dev/bidsummarize.user.js
// @updateURL	https://raw.githubusercontent.com/dmffen/lineselect/refs/heads/dev/bidsummarize.meta.js
// ==/UserScript==
(() => {
	'use strict';
	const userid = document.getElementById('FltOpsHeader1_lblGEMSID').textContent;
	let srcdata = document.getElementById('cphBody_DisplayTextFile1_lblContent');
	let output = document.createElement('div');
	output.id = '_bidsummarize_output';
	let dowork = output.appendChild(document.createElement('button'));
	dowork.textContent = 'Summarize';
	dowork.type = 'button';

	let bigdiv = document.getElementById('cphBody_pnlDisplayTextFile');
	bigdiv.parentNode.insertBefore(output, bigdiv);

	let addstyle = new CSSStyleSheet;
	addstyle.replaceSync(
		`span.dim {color:gray}
		table._bidtbl {border-collapse:collapse}
		table._bidtbl.hide {display:none}
		table._bidtbl td {padding:0.25em}
		table._bidtbl td:nth-child(3) {white-space:nowrap}
		table._bidtbl thead {font-weight:bold}
		table._bidtbl tbody tr:nth-child(odd) {background-color:#ddb}
		div._bidsummary {
			font-size:larger;
			font-weight:bold;
			padding:0.25em;
			margin:0.5em 0;
			background-color:#ddd;
		}
		div._bidsummary::before {content:'▼ '}
		div._bidsummary.hide::before {content:'▷ '}`
	);
	document.adoptedStyleSheets = [addstyle];

	function tbl_toggle(hdr, tbl) {
		hdr.classList.toggle('hide');
		tbl.classList.toggle('hide');
	}

	dowork.onclick = () => {
		const start = Date.now();
		let lines = srcdata.textContent.split(/\s*\n\s*/);
		let people = new Map();
		let prepared, pages, previous, show;
		const re1 = /^ONLY PILOTS WITH BIDS ON FILE AS OF (..\/..\/.. AT ..:..Z)/;
		const re2 = /^NAME\s.*(SCHEDULE|SYSTEM) BIDS.*Page\s+(\d+)/;
		// groups:    1 name                   2 emp.  3 sen.  4 base                5 A/C.  6 pos.       7 bidlist
		const re3 = /^([A-Z][\w-',. ]+[A-Z])\s+(\d+)\s+(\d+)\s+(ANC|MIA|ONT|SDFZ?)\s+(\w+)\s+(CPT|F\/O)\s+([\d ]+)/;
		const re4 = /^[\d ]+$/;

		while (lines.length) {
			let line = lines.shift();
			let found;
			if (found = line.match(/^\s*$/)) {
				continue;
			} else if (found = line.match(re1)) {
				prepared || (prepared = found[1]);
			} else if (found = line.match(re2)) {
				if (found[1] == "SYSTEM") break;
				pages = found[2];
			} else if (found = line.match(re3)) {
				let crewpos = found.slice(4, 7).join('_');
				let bidlist = found[7].split(/\s+/).map(n => Number.parseInt(n));
				let list;
				if (people.has(crewpos)) {
					list = people.get(crewpos);
				} else {
					list = [];
					people.set(crewpos, list);
				}
				// person: 0 sen.    1 emp.    2 name.   3 hold 4 bids
				list.push([found[3], found[2], found[1], -1,    bidlist]);
				previous = bidlist;
				if (found[2]==userid) show=crewpos;
			} else if (found = line.match(re4)) {
				Array.prototype.push.apply(previous, found[0].split(/\s+/).map(n => Number.parseInt(n)));
			} else {
				throw new Error(`weird line "${line}"`);
			}
		}

		people.forEach((roster, crewpos) => {
			let taken = new Set();
			roster.sort((a, b) => a[0] - b[0]);
			roster.forEach(person => {
				let bids = person.pop();
				let hold = bids.find(line => !taken.has(line));
				person.push(bids.map(line => `<span class=${taken.has(line) ? "dim" : ""}>${line}</span>`).join(' '));
				if (hold === undefined) {
					console.log(crewpos + ' ' + person.slice(0, 3).join() + ' underbid');
				} else {
					taken.add(hold);
					person[3] = hold;
				}
			})
		});

		output.innerHTML = '<div class="_bidinfo">Tap/click a bid group to expand or collapse</div>';

		[...people.keys()].sort().forEach(crewpos => {
			let hideclass = ((show==crewpos)?'':' hide');
			let tbl = document.createElement('table');
			tbl.id = 'bid_' + crewpos;
			tbl.className = '_bidtbl' + hideclass;
			tbl.appendChild(document.createElement('tbody'));
			people.get(crewpos).forEach(person => {
				let row = tbl.insertRow();
				person.forEach(field => {row.insertCell().innerHTML = field});
			});

			let header = document.createElement('thead');
			let row = header.insertRow();
			["Sen", "Emp", "Name", "Hold", "Bids"].forEach(h => {
				let th = row.insertCell();
				th.textContent = h;
				//TODO: th.onclick = () => {console.log(`sort ${crewpos} by ${h}`)};
			});
			tbl.prepend(header);

			let caption = document.createElement('div');
			caption.className = '_bidsummary' + hideclass;
			caption.textContent = crewpos;
			caption.onclick = () => tbl_toggle(caption, tbl);

			output.appendChild(caption);
			output.appendChild(tbl);
		});

		let caption = document.createElement('div');
		caption.className = '_bidinfo';
		caption.textContent = `Read ${pages} pages of bids dated "${prepared}" in ${Date.now() - start}ms`;
		output.appendChild(caption);
	};
})();
