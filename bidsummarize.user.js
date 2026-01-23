// ==UserScript==
// @name	bidsummarize
// @description	Analyze bid information to be more informative
// @license	GPLv3
// @version	1.0.1-alpha
// @match	https://flightops.inside.ups.com/Dotnet/CrewApps/Bidding/ViewBidSummary.aspx
// @grant	none
// @inject-into	content
// @downloadURL	https://raw.githubusercontent.com/dmffen/lineselect/dev/bidsummarize.user.js
// @updateURL	https://raw.githubusercontent.com/dmffen/lineselect/dev/bidsummarize.meta.js
// ==/UserScript==
(() => {
	'use strict';

	const Sortable = class {
		static {
			this.strcmp = Intl.Collator(undefined, {"sensitivity":"base"}).compare;
			['NOSORT', 'NUMERIC', 'STRING'].forEach((name, index) =>
				Object.defineProperty(this, name, {value:index})
			);
		}

		constructor(...coldef) {
			this.table = document.createElement('table');
			this.data = [];
			this.sortkey = undefined;
			let group = this.table.appendChild(document.createElement('colgroup'));
			let head = this.table.createTHead();

			coldef.forEach(([name, sorting = Sortable.NUMERIC], index) => {
				group.appendChild(document.createElement('col')).setAttribute('name', name);

				let cell = head.appendChild(document.createElement('th'));
				cell.textContent = name;
				if (sorting != Sortable.NOSORT) {
					cell.addEventListener('click', e => this.sortBy(sorting, index + 1));
					cell.className = 'sortable';
				}
			});

			this.body = this.table.appendChild(document.createElement('tbody'));
		}

		sortBy(sorting, element) {
			if (Math.abs(this.sortkey) == element) {
				this.data.reverse();
				this.sortkey *= -1;
			} else {
				this.sortkey = element;
				if (sorting === Sortable.NUMERIC) {
					this.data.sort((a, b) => a[element] - b[element]);
				} else {
					this.data.sort((a, b) => Sortable.strcmp(a[element], b[element]));
				}
				this.table.querySelectorAll('col.sort').forEach(col => col.classList.remove('sort'));
				this.table.querySelector(`col:nth-child(${element})`).classList.add('sort');
			}

			this.data.forEach(record => this.body.appendChild(record[0]));
		}

		addData(newdata) {
			newdata.forEach(record => {
				let row = this.body.insertRow();
				record.forEach(field => row.insertCell().innerHTML = field);
				this.data.push([row, ...record]);
			});
		}
	};

	const userid = document.getElementById('FltOpsHeader1_lblGEMSID').textContent;
	const srcdata = document.querySelector('pre');
	let anchor = document.querySelector('div[id^=cphBody_]');
	let output = anchor.insertAdjacentElement('afterend', document.createElement('div'));
	output.id = '_bidsummarize';
	output.className="_bidinfo";
	let dowork = output.appendChild(document.createElement('button'));
	dowork.textContent = 'Summarize';
	dowork.type = 'button';

	let addstyle = new CSSStyleSheet;
	addstyle.replaceSync(
		`span.dim {color:gray}
		table._bidtbl {border-collapse:collapse; min-height:0;}
		table._bidtbl td, table._bidtbl th {padding:0.3em; overflow-x:scroll;}
		table._bidtbl td:nth-child(3) {white-space:nowrap}
		table._bidtbl thead {font-weight:bold; white-space:nowrap; border-bottom:1px solid black; text-align:left;}
		table._bidtbl thead th.sortable::before {content:'⇅ '}
		table._bidtbl tbody tr:nth-child(odd) {background-color:#2022}
		table._bidtbl col.sort {background-color:#ffdf}
		div._wrapper {max-width:100vw}
		div._bidsummary {font-size:larger; font-weight:bold; line-height:1.5; margin:0.3em 0; background-color:#ddd;}
		div._bidsummary::before {content:'▷ '}
		div._bidsummary + div._wrapper {display:grid; overflow:hidden; transition:grid-template-rows 400ms; grid-template-rows:0fr;}
		div._bidsummary.show::before {content:'▼ '}
		div._bidsummary.show + div._wrapper {grid-template-rows:1fr}
		div.scroll table._bidtbl td {white-space:nowrap; max-width:500;}`
	);
	document.adoptedStyleSheets.push(addstyle);

	dowork.onclick = () => {
		const start = Date.now();
		let lines = srcdata.textContent.split(/\s*\n\s*/);
		let people = new Map();
		let prepared, pages, previous, show;
		const re1 = /^ONLY PILOTS WITH BIDS ON FILE AS OF (..\/..\/.. AT ..:..Z)/;
		const re2 = /^NAME\s.*(SCHEDULE|SYSTEM) BIDS.*Page\s+(\d+)/;
		// groups:    1 name                   2 emp.  3 sen.  4 base                5 A/C.  6 pos.        7 bidlist
		const re3 = /^([A-Z][\w-',. ]+[A-Z])\s+(\d+)\s+(\d+)\s+(ANC|MIA|ONT|SDFZ?)\s+(\w+)\s+(CPT|F\/?O)\s+([\d ]+)/;
		const re4 = /^[\d ]+$/;

		while (lines.length) {
			let line = lines.shift();
			let found, list;
			if (found = line.match(/^\s*$/)) {
				continue;
			} else if (found = line.match(re1)) {
				prepared || (prepared = found[1]);
			} else if (found = line.match(re2)) {
				if (found[1] == "SYSTEM") break;
				pages = found[2];
			} else if (found = line.replace('/', '').match(re3)) {
				let crewpos = found.slice(4, 7).join('_');
				let [sen, emp, ...bidlist] = [found[3], found[2], ...found[7]
					.split(/\s+/)].map(n => Number.parseInt(n));
				(list = people.get(crewpos)) ?? people.set(crewpos, list = []);
				// person:0 sen 1 emp 2 name 3 hold 4 bids
				list.push([sen, emp, found[1], -1, bidlist]);
				previous = bidlist;
				if (found[2] == userid) show = crewpos;
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
				if (hold != undefined) {
					taken.add(hold);
					person[3] = hold;
				}
			})
		});

		output.textContent = 'Tap/click a bid group to expand/collapse. Tap column headings to sort a table.';

		Array.from(people.keys()).sort().forEach(crewpos => {
			let sorter = new Sortable(['Sen'],['Emp'],['Name',Sortable.STRING],['Hold'],['Bids',Sortable.NOSORT]);
			sorter.table.id = 'bid_' + crewpos;
			sorter.table.className = '_bidtbl';
			sorter.addData(people.get(crewpos));
			sorter.sortBy(Sortable.NUMERIC, 1);

			let caption = document.createElement('div');
			caption.className = '_bidsummary' + ((show==crewpos)?' show':'');
			caption.textContent = crewpos;
			caption.onclick = () => caption.classList.toggle('show');

			let wrapper = document.createElement('div');
			wrapper.className = '_wrapper';

			output.appendChild(caption);
			output.appendChild(wrapper);
			wrapper.appendChild(sorter.table);
		});

		let caption = document.createElement('div');
		caption.className = '_bidinfo';
		caption.innerHTML =
`Note: This summary has no information about: the range of valid bid numbers, which round of
bidding (if any) is open, or how many people have not yet bid.<br>A "Hold" value of -1 means that
person underbid.<br>Read ${pages} pages of bids dated "${prepared}" in ${Date.now() - start}ms`;
		output.appendChild(caption);
	};
})();
