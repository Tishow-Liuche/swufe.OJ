<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { Check, ChevronDown } from '@lucide/vue';

interface SelectOption {
  value: string;
  label: string;
}

const props = defineProps<{
  modelValue: string;
  options: readonly SelectOption[];
  label: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const rootElement = ref<HTMLElement | null>(null);
const triggerElement = ref<HTMLButtonElement | null>(null);
const optionElements = ref<Array<HTMLElement | null>>([]);
const isOpen = ref(false);
const activeIndex = ref(0);
const componentId = useId();
const listboxId = `filter-select-${componentId}`;

const selectedOption = computed(() => (
  props.options.find((option) => option.value === props.modelValue) || props.options[0]
));

const selectedIndex = computed(() => {
  const index = props.options.findIndex((option) => option.value === props.modelValue);
  return index >= 0 ? index : 0;
});

watch(() => props.modelValue, () => {
  activeIndex.value = selectedIndex.value;
});

onClickOutside(rootElement, () => closeMenu());

function setOptionElement(element: unknown, index: number) {
  optionElements.value[index] = element instanceof HTMLElement ? element : null;
}

function focusOption(index: number) {
  const optionCount = props.options.length;
  if (!optionCount) return;
  activeIndex.value = (index + optionCount) % optionCount;
  void nextTick(() => optionElements.value[activeIndex.value]?.focus({ preventScroll: true }));
}

function openMenu(preferredIndex = selectedIndex.value) {
  if (!props.options.length) return;
  isOpen.value = true;
  focusOption(preferredIndex);
}

function closeMenu(returnFocus = false) {
  isOpen.value = false;
  if (returnFocus) {
    void nextTick(() => triggerElement.value?.focus({ preventScroll: true }));
  }
}

function toggleMenu() {
  if (isOpen.value) closeMenu();
  else openMenu();
}

function selectOption(option: SelectOption) {
  if (option.value !== props.modelValue) emit('update:modelValue', option.value);
  closeMenu(true);
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    openMenu(selectedIndex.value);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    openMenu(selectedIndex.value || props.options.length - 1);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleMenu();
  } else if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault();
    closeMenu(true);
  }
}

function handleOptionKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusOption(index + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    focusOption(index - 1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    focusOption(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    focusOption(props.options.length - 1);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectOption(props.options[index]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu(true);
  } else if (event.key === 'Tab') {
    closeMenu();
  }
}
</script>

<template>
  <div ref="rootElement" class="filter-select" :class="{ 'is-open': isOpen }">
    <button
      ref="triggerElement"
      type="button"
      class="filter-select__trigger"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="listboxId"
      @click="toggleMenu"
      @keydown="handleTriggerKeydown"
    >
      <span class="filter-select__leading" aria-hidden="true">
        <slot name="icon"></slot>
      </span>
      <span class="filter-select__value">{{ selectedOption?.label }}</span>
      <ChevronDown class="filter-select__chevron" :size="17" aria-hidden="true" />
    </button>

    <Transition name="filter-select-menu">
      <div
        v-if="isOpen"
        :id="listboxId"
        class="filter-select__menu"
        role="listbox"
        :aria-label="label"
      >
        <button
          v-for="(option, index) in options"
          :id="`${listboxId}-option-${index}`"
          :key="option.value"
          :ref="(element) => setOptionElement(element, index)"
          type="button"
          class="filter-select__option"
          :class="{
            'is-active': activeIndex === index,
            'is-selected': modelValue === option.value,
          }"
          role="option"
          :aria-selected="modelValue === option.value"
          :tabindex="activeIndex === index ? 0 : -1"
          @click="selectOption(option)"
          @focus="activeIndex = index"
          @pointerenter="activeIndex = index"
          @keydown="handleOptionKeydown($event, index)"
        >
          <span class="filter-select__option-label">{{ option.label }}</span>
          <Check
            class="filter-select__check"
            :class="{ 'is-visible': modelValue === option.value }"
            :size="17"
            aria-hidden="true"
          />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.filter-select {
  position: relative;
  min-width: 0;
  height: 44px;
  color: var(--muted, #68717e);
}

.filter-select__trigger {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--outline, #d8dde5);
  border-radius: 8px;
  background: var(--surface, #fff);
  color: var(--ink, #20252c);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.filter-select__trigger:hover {
  border-color: #bcc4ce;
  background: var(--surface-low, #f4f6f8);
}

.filter-select__trigger:focus-visible,
.is-open .filter-select__trigger {
  border-color: var(--primary, #1f5eff);
  outline: 0;
  background: var(--surface, #fff);
  box-shadow: 0 0 0 3px rgba(31, 94, 255, 0.12);
}

.filter-select__leading {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--muted, #68717e);
}

.filter-select__leading :deep(svg) {
  width: 17px;
  height: 17px;
}

.filter-select__value {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-select__chevron {
  flex: 0 0 auto;
  color: #7a838f;
  transition: transform 150ms ease, color 150ms ease;
}

.is-open .filter-select__chevron {
  color: var(--primary-strong, #1748c9);
  transform: rotate(180deg);
}

.filter-select__menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 7px);
  right: 0;
  width: 100%;
  max-height: 280px;
  padding: 5px;
  overflow-y: auto;
  border: 1px solid var(--outline, #d8dde5);
  border-radius: 8px;
  background: var(--surface, #fff);
  box-shadow: 0 10px 28px rgba(31, 42, 55, 0.14), 0 2px 7px rgba(31, 42, 55, 0.08);
}

.filter-select__option {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink, #20252c);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
}

.filter-select__option:hover,
.filter-select__option.is-active {
  background: var(--surface-low, #f4f6f8);
}

.filter-select__option:focus-visible {
  outline: 2px solid rgba(31, 94, 255, 0.34);
  outline-offset: -2px;
}

.filter-select__option.is-selected {
  background: var(--primary-container, #e2eaff);
  color: var(--primary-strong, #1748c9);
  font-weight: 680;
}

.filter-select__option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-select__check {
  flex: 0 0 auto;
  opacity: 0;
}

.filter-select__check.is-visible {
  opacity: 1;
}

.filter-select-menu-enter-active,
.filter-select-menu-leave-active {
  transition: opacity 130ms ease, transform 130ms ease;
  transform-origin: top right;
}

.filter-select-menu-enter-from,
.filter-select-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

@media (max-width: 720px) {
  .filter-select__option {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .filter-select__trigger,
  .filter-select__chevron,
  .filter-select__option,
  .filter-select-menu-enter-active,
  .filter-select-menu-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
