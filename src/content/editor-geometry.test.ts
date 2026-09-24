import { beforeEach, describe, expect, test, vi } from "vitest";

import { resolveEditorAnchor, visibleEditorRect } from "./editor-geometry";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function mockContentRects(...rects: DOMRect[]): void {
  vi.spyOn(document, "createRange").mockReturnValue({
    selectNodeContents: vi.fn(),
    getClientRects: () => rects,
  } as unknown as Range);
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("editor geometry", () => {
  test("uses ordinary form controls as their own visual anchor", () => {
    const textarea = document.createElement("textarea");
    textarea.getBoundingClientRect = (): DOMRect => rect(20, 30, 400, 160);
    document.body.appendChild(textarea);

    expect(resolveEditorAnchor(textarea)).toBe(textarea);
    expect(visibleEditorRect(textarea)).toMatchObject({
      left: 20,
      top: 30,
      width: 400,
      height: 160,
    });
  });

  test("promotes a collapsed block editor to the surface containing its painted text", () => {
    const wrapper = document.createElement("div");
    const surface = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    wrapper.appendChild(surface);
    surface.appendChild(editable);
    document.body.appendChild(wrapper);
    editable.getBoundingClientRect = (): DOMRect => rect(92, 220, 1, 240);
    surface.getBoundingClientRect = (): DOMRect => rect(90, 218, 1_200, 244);
    wrapper.getBoundingClientRect = (): DOMRect => rect(80, 180, 1_240, 320);
    mockContentRects(rect(92, 220, 620, 28));

    expect(resolveEditorAnchor(editable)).toBe(surface);
    expect(visibleEditorRect(editable)).toMatchObject({
      left: 90,
      top: 218,
      width: window.innerWidth - 90,
      height: 244,
    });
  });

  test("keeps a normal rich editor as its own visual anchor", () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.getBoundingClientRect = (): DOMRect => rect(40, 50, 600, 180);
    document.body.appendChild(editable);
    mockContentRects(rect(52, 62, 300, 24));

    expect(resolveEditorAnchor(editable)).toBe(editable);
  });

  test("does not promote a legitimate compact inline editor to a large parent", () => {
    const parent = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.style.display = "inline-block";
    parent.appendChild(editable);
    document.body.appendChild(parent);
    editable.getBoundingClientRect = (): DOMRect => rect(40, 50, 40, 30);
    parent.getBoundingClientRect = (): DOMRect => rect(20, 20, 800, 400);
    mockContentRects(rect(40, 50, 140, 30));

    expect(resolveEditorAnchor(editable)).toBe(editable);
  });

  test("promotes a small block editor when its text paints on a containing surface", () => {
    const surface = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    surface.appendChild(editable);
    document.body.appendChild(surface);
    editable.getBoundingClientRect = (): DOMRect => rect(100, 120, 24, 24);
    surface.getBoundingClientRect = (): DOMRect => rect(80, 90, 640, 240);
    mockContentRects(rect(100, 120, 420, 72));

    expect(resolveEditorAnchor(editable)).toBe(surface);
  });

  test("keeps a small block editor when its content is contained by its own box", () => {
    const parent = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    parent.appendChild(editable);
    document.body.appendChild(parent);
    editable.getBoundingClientRect = (): DOMRect => rect(100, 120, 24, 24);
    parent.getBoundingClientRect = (): DOMRect => rect(80, 90, 640, 240);
    mockContentRects(rect(102, 122, 20, 20));

    expect(resolveEditorAnchor(editable)).toBe(editable);
  });

  test("resolves a visual anchor across an open Shadow DOM boundary", () => {
    const host = document.createElement("div");
    host.getBoundingClientRect = (): DOMRect => rect(30, 40, 500, 160);
    const shadow = host.attachShadow({ mode: "open" });
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.getBoundingClientRect = (): DOMRect => rect(30, 40, 0, 0);
    shadow.appendChild(editable);
    document.body.appendChild(host);
    mockContentRects();

    expect(resolveEditorAnchor(editable)).toBe(host);
  });

  test("resolves a containing surface at any composed-tree depth", () => {
    const surface = document.createElement("section");
    surface.getBoundingClientRect = (): DOMRect => rect(30, 40, 700, 260);
    let parent: HTMLElement = surface;
    for (let index = 0; index < 7; index += 1) {
      const wrapper = document.createElement("div");
      wrapper.getBoundingClientRect = (): DOMRect => rect(30, 40, 0, 0);
      parent.appendChild(wrapper);
      parent = wrapper;
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.getBoundingClientRect = (): DOMRect => rect(30, 40, 0, 0);
    parent.appendChild(editable);
    document.body.appendChild(surface);
    mockContentRects();

    expect(resolveEditorAnchor(editable)).toBe(surface);
  });

  test("intersects the editor with viewport and nested clipping ancestors", () => {
    const clip = document.createElement("div");
    clip.style.overflow = "auto";
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    clip.appendChild(editable);
    document.body.appendChild(clip);
    clip.getBoundingClientRect = (): DOMRect => rect(100, 80, 300, 170);
    editable.getBoundingClientRect = (): DOMRect => rect(50, 40, 500, 300);

    expect(visibleEditorRect(editable)).toMatchObject({
      left: 100,
      top: 80,
      width: 300,
      height: 170,
    });
  });

  test("returns null when clipping fully hides the editor", () => {
    const clip = document.createElement("div");
    clip.style.overflow = "hidden";
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    clip.appendChild(editable);
    document.body.appendChild(clip);
    clip.getBoundingClientRect = (): DOMRect => rect(700, 600, 100, 100);
    editable.getBoundingClientRect = (): DOMRect => rect(20, 20, 300, 100);

    expect(visibleEditorRect(editable)).toBeNull();
  });

  test("returns null for an editor inside a hidden application surface", () => {
    const container = document.createElement("div");
    container.style.visibility = "hidden";
    const textarea = document.createElement("textarea");
    textarea.getBoundingClientRect = (): DOMRect => rect(20, 30, 400, 160);
    container.appendChild(textarea);
    document.body.appendChild(container);

    expect(visibleEditorRect(textarea)).toBeNull();
    container.style.visibility = "visible";
    expect(visibleEditorRect(textarea)).toMatchObject({ left: 20, top: 30, width: 400 });
  });

  test("uses the visual viewport during zoomed or offset layouts", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        offsetLeft: 100,
        offsetTop: 200,
        width: 300,
        height: 150,
      },
    });
    const textarea = document.createElement("textarea");
    textarea.getBoundingClientRect = (): DOMRect => rect(110, 210, 500, 300);
    document.body.appendChild(textarea);

    expect(visibleEditorRect(textarea)).toMatchObject({
      left: 110,
      top: 210,
      width: 290,
      height: 140,
    });

    if (descriptor) Object.defineProperty(window, "visualViewport", descriptor);
    else Reflect.deleteProperty(window, "visualViewport");
  });
});
