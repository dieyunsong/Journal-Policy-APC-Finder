/**
 * script.js
 *
 * Fetches journal data from data.json and renders it in a DataTables table.
 *
 * data.json structure:
 *   {
 *     "header": [...],   // Human-readable column names (not used directly by DataTables)
 *     "version": "...",  // A string representing when the data was last generated.
 *     "data": [          // Array of rows; each row is an array with these indices:
 *       [0] Publisher
 *       [1] Journal Title
 *       [2] eISSN
 *       [3] eISSN Link (URL to ISSN portal)
 *       [4] Link to Agreement Info (URL)
 *     ]
 *   }
 *
 * Dependencies: jQuery, DataTables 2.x, Bootstrap 5
 */

$(document).ready(function () {
    // rawData holds the full dataset fetched from data.json.
    // It is populated inside the DataTables ajax.dataSrc callback and used
    // by the custom search filter to access row fields by index.
    var rawData = [];
    // Column definitions map each visible column to its index in the data.json row array.
    // The 'data' property is the numeric index of the corresponding field in each row.
    // Note: index 3 (eISSN Link URL) is intentionally omitted here because it is
    // accessed inside a columnDef render function for the eISSN column instead.
    var columns = [
        { title: "Journal Title", data: 1 },
        { title: "eISSN", data: 2 },
        { title: "Publisher", data: 0 },
        { title: "Agreement Info", data: 4 }
    ];

    // Filter state variables.
    // selectedPublishers holds the values currently checked in the publisher filter.
    // It starts empty and is populated after data loads.  allPublishersCount stores
    // the total number of unique values so renderFilterSummary can detect when the
    // user has changed the default (all selected).
    var selectedPublishers = [];
    var allPublishersCount = 0;

    // Register a custom search function with DataTables.
    // DataTables calls this for every row on each draw; returning true keeps the row
    // visible, false hides it.  The guard on settings.nTable.id ensures this filter
    // only runs for #apcTable and not any other DataTables instance on the page.
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        if (settings.nTable.id !== 'apcTable') {
            return true;
        }
        // Read the raw publisher value directly from rawData using dataIndex (the row's
        // position in the full dataset) rather than the DataTables-processed 'data'
        // array, so we always have the original unformatted string.
        var publisher = rawData[dataIndex] ? rawData[dataIndex][0] : '';

        // Publisher filter: hide the row if no publishers are selected, or if this
        // row's publisher is not in the selected list.
        if (selectedPublishers.length === 0) {
            return false;
        }
        if (selectedPublishers.indexOf(publisher) === -1) {
            return false;
        }
        return true;
    });

    // Initialize the DataTables instance on #apcTable.
    // The table is empty on page load; data is fetched asynchronously via the
    // ajax option below.  See https://datatables.net/reference/option/ for full docs.
    var table = $('#apcTable').DataTable({
        layout: {
            top6Start: function () {
                let filterContainer = document.createElement('div');
                filterContainer.innerHTML = '<h2 id="searchandfilter">Search and Filter</h2>';
                return filterContainer;
            },
            top5Start: {
                search: {
                    placeholder: 'Search',
                }
            },
            top4Start: function () {
                let filterContainer = document.createElement('div');
                filterContainer.innerHTML = CreateFilterContainer();
                let summaryDiv = document.createElement('div');
                summaryDiv.id = 'filterSummaryContainer';
                summaryDiv.style.minHeight = '2.2em';
                summaryDiv.style.display = 'flex';
                summaryDiv.style.alignItems = 'center';
                summaryDiv.innerHTML = '<span id="filterSummaryText"></span>' +
                    '<button id="clearAllFiltersBtn" class="anchor-button">Clear all filters</button>';
                summaryDiv.style.visibility = 'hidden';
                filterContainer.appendChild(summaryDiv);
                return filterContainer;
            },
            top3: function () {
                let separator = document.createElement('hr');
                separator.className = 'horizontal-line-dt mb-4';
                return separator;
            },
            top2Start: function () {
                let filterContainer = document.createElement('div');
                filterContainer.innerHTML = '<h2>Search Results</h2>';
                return filterContainer;
            },
            top1Start: function () {
                let filterContainer = document.createElement('div');
                filterContainer.innerHTML = '<div class="info">Learn more about <a href="#eissnInfo">EISSN</a> and <a href="#agreementInfo">Agreement Info</a>.</div>';
                return filterContainer;
            },
            topStart: 'info',
            topEnd: 'pageLength',
            bottomStart: 'info',
            bottomEnd: 'paging'
        },
        // DataTables fetches data.json via AJAX on initialization.
        // 'dataSrc' is a callback that receives the parsed JSON object and must return
        // the array of rows that DataTables will render.  This is where we bootstrap
        // the filter state and build the filter dropdown checkboxes.
        ajax: {
            url: "data.json",
            dataSrc: function (json) {
                // Cache the full dataset so the custom search function can reference
                // raw field values (e.g., publisher name at index 0) by row index.
                rawData = json.data;

                // Build the publisher filter checkboxes from the live data so they
                // always reflect exactly what is present in data.json.
                populatePublisherFilters(json.data);

                // Pre-select all publishers so the table shows everything on first load.
                if (selectedPublishers.length === 0) {
                    var allPublishers = [];
                    json.data.forEach(function (row) {
                        var publisher = row[0];
                        if (publisher && allPublishers.indexOf(publisher) === -1) {
                            allPublishers.push(publisher);
                        }
                    });
                    selectedPublishers = allPublishers;
                }

                // Return the raw rows array; DataTables maps each row to the 'columns'
                // definitions using the numeric 'data' indices defined above.
                return json.data;
            }
        },
        columns: columns,
        pageLength: 10,
        lengthMenu: [5, 10, 25, 50, 100],
        order: [[0, 'asc']],
        autoWidth: false,
        responsive: true,
        language: {
            search: "Search by Journal Title, or eISSN (i.e., 0010-0285):",
            emptyTable: CreateNoResultsMessage(),
            zeroRecords: CreateNoResultsMessage(),
        },
        initComplete: function() {
            // Add autocomplete attribute to search input
            $('.dt-search input[type="search"]').attr('autocomplete', 'on');
        },
        columnDefs: [
            // Exclude the Agreement Info column (rendered index 3) from DataTables'
            // built-in search so users can't accidentally match on the raw URL.
            {
                "targets": [3],
                "searchable": false
            },
            // eISSN column (rendered index 1, data index 2): wrap the eISSN value in a
            // hyperlink pointing to the ISSN portal URL stored at row index 3.
            // The 'type === display' guard prevents the link markup from being applied
            // during sorting/filtering operations where plain text is expected.
            {
                "targets": 1,
                "render": function (data, type, row) {
                    if (type === 'display' && data && row[3]) {
                        return '<a href="' + row[3] + '" target="_blank">' + data + '<span class="material-symbols-rounded">open_in_new</span></a>';
                    }
                    return data;
                }
            },
            // Agreement Info column (rendered index 3, data index 4): render the raw URL
            // as a descriptive link using the publisher name from row index 0 so the link
            // text is meaningful for screen reader users.
            {
                "targets": 3,
                "width": "150px",
                "render": function (data, type, row) {
                    if (type === 'display' && data) {
                        return '<a href="' + data + '" target="_blank">Info about ' + row[0] + '<span class="material-symbols-rounded">open_in_new</span>' + ' agreement</a>';
                    }
                    return data;
                }
            }
        ]
    });

    /**
     * populatePublisherFilters
     * Builds the publisher filter checkboxes by extracting every unique publisher
     * name from index 0 of each row in the dataset.  All checkboxes start checked
     * so the full table is visible on first load.
     *
     * @param {Array} data - The full rows array from data.json.
     */
    function populatePublisherFilters(data) {
        var publishers = [];
        data.forEach(function (row) {
            var publisher = row[0];
            if (publisher && publishers.indexOf(publisher) === -1) {
                publishers.push(publisher);
            }
        });
        publishers.sort();
        allPublishersCount = publishers.length;

        var filtersHtml = '';
        filtersHtml += '<div class="d-flex align-items-center mb-2">'
            + '<button type="button" class="anchor-button p-0 me-2" id="applyAllPublishers"><b>Apply All</b></button>'
            + '<button type="button" class="anchor-button p-0" id="removeAllPublishers"><b>Remove All</b></button>'
            + '</div>';
        filtersHtml += '<hr class="my-2">';
        publishers.forEach(function (publisher, index) {
            filtersHtml += '<div class="checkbox-option">';
            filtersHtml += '<input type="checkbox" class="publisher-checkbox" id="pub_' + index + '" value="' + publisher + '" checked>';
            filtersHtml += '<label for="pub_' + index + '">' + publisher + '</label>';
            filtersHtml += '</div>';
        });
        $('#publisherDropdownContent').html(filtersHtml);
    }

    /**
     * filterTable
     * Reads the current state of all publisher checkboxes, updates the
     * selectedPublishers array, then triggers a DataTables redraw.  The custom
     * search function registered above is re-evaluated for every row during the
     * redraw, applying the updated filter state.
     */
    function filterTable() {
        selectedPublishers = [];
        $('.publisher-checkbox:checked').each(function () {
            selectedPublishers.push($(this).val());
        });
        renderFilterSummary();
        table.draw();
    }

    /**
     * renderFilterSummary
     * Shows or hides the filter summary banner above the table.
     * The banner is visible only when the active filters differ from the default
     * (i.e., not all publishers selected).  It displays a human-readable description
     * of how many publishers are currently selected.
     */
    function renderFilterSummary() {
        var pubCount = selectedPublishers.length;
        var show = (pubCount !== allPublishersCount);
        if (show) {
            var text = 'Filtering by ' + pubCount + ' publisher' + (pubCount !== 1 ? 's' : '');
            $('#filterSummaryText').text(text);
            $('#filterSummaryContainer').css('visibility', 'visible');
        } else {
            $('#filterSummaryText').text('');
            $('#filterSummaryContainer').css('visibility', 'hidden');
        }
    }


    // "Clear all filters" button in the filter summary banner:
    // resets all checkboxes to checked.
    $(document).on('click', '#clearAllFiltersBtn', function () {
        $('.publisher-checkbox').prop('checked', true);
        filterTable();
    });

    // Prevent clicks inside the filter dropdown menu from bubbling up to the
    // Bootstrap dropdown toggle, which would otherwise close the menu immediately
    // after the user interacts with a checkbox or button.
    $(document).on('click', '#publisherDropdownContent input, #publisherDropdownContent label, #publisherDropdownContent button', function (e) {
        e.stopPropagation();
    });

    // Any individual publisher checkbox change triggers a table redraw.
    $(document).on('change', '.publisher-checkbox', function () {
        filterTable();
    });

    // "Apply All" / "Remove All" buttons inside the publisher dropdown.
    $(document).on('click', '#applyAllPublishers', function (e) {
        e.preventDefault();
        $('.publisher-checkbox').prop('checked', true);
        filterTable();
    });
    $(document).on('click', '#removeAllPublishers', function (e) {
        e.preventDefault();
        $('.publisher-checkbox').prop('checked', false);
        filterTable();
    });

    // "Clear all filters" link rendered inside the empty-state message
    // (CreateNoResultsMessage).  Also clears the DataTables search string so the
    // user returns to a completely unfiltered view.
    $(document).on('click', '#clearAllFiltersFromEmpty', function (e) {
        e.preventDefault();
        $('.publisher-checkbox').prop('checked', true);
        table.search('').draw();
        filterTable();
    });
});

/**
 * CreateFilterContainer
 * Returns an HTML string for the publisher dropdown filter.  This is injected into
 * the DataTables layout via the top4Start custom element function defined in the
 * table config.
 *
 * The publisher dropdown contents (#publisherDropdownContent) are populated
 * dynamically by populatePublisherFilters after data.json has been fetched.
 *
 * @returns {string} HTML markup string.
 */
function CreateFilterContainer() {
    return `
        <div class="mb-2 mt-2 ms-1 d-flex flex-wrap gap-3">
            <div class="d-flex flex-column">
                <label for="publisherDropdown">Filter by Publisher:</label>
                <div class="dropdown d-inline-block me-3">
                <button class="button button--secondary" type="button" id="publisherDropdown" data-bs-toggle="dropdown"
                    aria-expanded="false">
                    Select Publishers
                    <span class="material-symbols-rounded dropdown-icon">
                    arrow_drop_down
                    </span>
                </button>
                <ul class="dropdown-menu p-3" aria-labelledby="publisherDropdown"
                    style="min-width: 300px; max-height: 300px; overflow-y: auto;">
                    <li id="publisherDropdownContent"></li>
                </ul>
                </div>
            </div>
        </div>
    `
}

/**
 * CreateNoResultsMessage
 * Returns an HTML string shown by DataTables when no rows match the current
 * search/filter state (used for both emptyTable and zeroRecords language options).
 * Includes a "Clear all filters" button that delegates to the
 * #clearAllFiltersFromEmpty event handler registered above.
 *
 * @returns {string} HTML markup string.
 */
function CreateNoResultsMessage() {
    return `
        <div style="text-align: center; padding: 2rem;">
            <h3 style="color: var(--color-neutral-300); margin-bottom: 1rem;">No matching records found</h3>
            <p style="color: var(--color-neutral-300); margin-bottom: 1.5rem;">Here are the most likely reasons:</p>
            <ol style="color: var(--color-neutral-300); text-align: left; max-width: 600px; margin: 0 auto 1.5rem auto;">
                <li style="color: var(--color-neutral-300); margin-bottom: 1rem;">
                    <strong>Journal Not Covered:</strong> The journal is not covered under Northwestern University Libraries or BTAA agreements.
                    The journal may still be open access, but not managed through these agreements. For some publishers, coverage is listed at the
                    publisher level &mdash; check the publisher's own journal finder.
                    Visit <a href="https://www.library.northwestern.edu/use-the-libraries/research-teaching/open-access-publishing/">Open Access Publishing at Northwestern</a> for more information.
                </li>
                <li style="color: var(--color-neutral-300); margin-bottom: 1rem;">
                    <strong>Too Many Filters:</strong> You may have selected a publisher filter that excludes the journal you're searching for.
                    Try removing all active filters and searching again.
                </li>
                <li style="color: var(--color-neutral-300); margin-bottom: 1rem;">
                    <strong>Typo or Variant of Title:</strong> Check the spelling or title, or verify the journal's EISSN and use that instead.
                </li>
            </ol>
            <button id="clearAllFiltersFromEmpty" class="anchor-button">Clear all filters</button>
        </div>
    `;
}
