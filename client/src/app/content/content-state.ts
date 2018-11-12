import { Action } from '@ngrx/store';

export enum ToggleBackgroundType {
    USER_VIEWS = '[Content-Background] User',
    DYNAMIC = '[Content-Background] Dynamic'
}

export class ToggleBackgroundTypeAction implements Action {
    readonly type: ToggleBackgroundType;

    constructor(type) {this.type = type;}
}

export function backgroundUserReducer(useUserBackground: boolean, action: ToggleBackgroundTypeAction):boolean {
    console.log(action);
    return action.type === ToggleBackgroundType.USER_VIEWS;
}