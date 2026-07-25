import { ref } from 'vue';
import { searchLocations } from '../api/weather';
const emit = defineEmits();
const query = ref('');
const results = ref([]);
const open = ref(false);
const loading = ref(false);
const error = ref('');
let timer;
let controller;
function onInput() {
    clearTimeout(timer);
    error.value = '';
    if (query.value.trim().length < 2) {
        results.value = [];
        open.value = false;
        return;
    }
    timer = setTimeout(runSearch, 250);
}
async function runSearch() {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    try {
        results.value = await searchLocations(query.value.trim(), controller.signal);
        open.value = true;
    }
    catch (reason) {
        if (reason.name !== 'AbortError') {
            error.value = reason.message;
            open.value = true;
        }
    }
    finally {
        loading.value = false;
    }
}
function select(location) {
    query.value = '';
    open.value = false;
    emit('select', location);
}
function locationDetail(location) {
    return [location.region, location.country].filter(Boolean).join(' · ');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "location-search" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "search-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "search-symbol" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sr-only" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (__VLS_ctx.onInput) },
    ...{ onFocus: (...[$event]) => {
            __VLS_ctx.results.length && (__VLS_ctx.open = true);
        } },
    ...{ onKeydown: (...[$event]) => {
            __VLS_ctx.open = false;
        } },
    type: "search",
    placeholder: "Ort oder Postleitzahl",
    autocomplete: "off",
});
(__VLS_ctx.query);
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "search-loader" },
        'aria-label': "Suche läuft",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({});
}
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-results" },
    });
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "search-message" },
        });
        (__VLS_ctx.error);
    }
    else if (!__VLS_ctx.results.length && !__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "search-message" },
        });
    }
    for (const [location] of __VLS_getVForSourceType((__VLS_ctx.results))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.select(location);
                } },
            key: (location.id),
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (location.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (__VLS_ctx.locationDetail(location));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
    }
}
/** @type {__VLS_StyleScopedClasses['location-search']} */ ;
/** @type {__VLS_StyleScopedClasses['search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['search-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['search-loader']} */ ;
/** @type {__VLS_StyleScopedClasses['search-results']} */ ;
/** @type {__VLS_StyleScopedClasses['search-message']} */ ;
/** @type {__VLS_StyleScopedClasses['search-message']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            query: query,
            results: results,
            open: open,
            loading: loading,
            error: error,
            onInput: onInput,
            select: select,
            locationDetail: locationDetail,
        };
    },
    __typeEmits: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
});
; /* PartiallyEnd: #4569/main.vue */
