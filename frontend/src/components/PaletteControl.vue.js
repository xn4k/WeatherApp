const __VLS_props = defineProps();
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "palette-control" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('next');
        } },
    ...{ class: "palette-next" },
    type: "button",
    'aria-label': (`Nächste Farbpalette. Aktuell: ${__VLS_ctx.palette.name}`),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "palette-swatches" },
    'aria-hidden': "true",
});
for (const [color] of __VLS_getVForSourceType((__VLS_ctx.palette.colors))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        key: (color),
        ...{ style: ({ background: color }) },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "palette-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
(String(__VLS_ctx.position).padStart(2, '0'));
(String(__VLS_ctx.total).padStart(2, '0'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.palette.name);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "cycle-icon" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('toggle');
        } },
    ...{ class: "palette-auto" },
    type: "button",
    ...{ class: ({ active: __VLS_ctx.automatic }) },
    'aria-pressed': (__VLS_ctx.automatic),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.automatic ? 'an' : 'aus');
/** @type {__VLS_StyleScopedClasses['palette-control']} */ ;
/** @type {__VLS_StyleScopedClasses['palette-next']} */ ;
/** @type {__VLS_StyleScopedClasses['palette-swatches']} */ ;
/** @type {__VLS_StyleScopedClasses['palette-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['palette-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
