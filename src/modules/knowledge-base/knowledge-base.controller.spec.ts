import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { UserRole } from '../../auth/roles.enum';
import { RolesGuard } from '../../auth/roles.guard';

// Verifies (1) the read endpoints return seeded-shaped content from the
// service, unfiltered by any tenant/school, and (2) the write endpoints
// are actually gated by RolesGuard + @Roles(SUPER_ADMIN) — the same
// mechanism this codebase's other admin-only routes rely on globally
// via APP_GUARD, exercised here directly against the metadata this
// controller declares.
describe('KnowledgeBaseController', () => {
  const seededArticle = {
    module: 'hr',
    tabKey: 'employees',
    title: 'Employees',
    tagline: 'The single source of truth for every person on payroll.',
    body: 'This is the master directory.',
    steps: ['Click + Add Employee for a single new hire.'],
    order: 2,
  };

  const serviceMock = {
    list: jest.fn().mockResolvedValue([seededArticle]),
    findOne: jest.fn().mockResolvedValue(seededArticle),
    search: jest.fn().mockResolvedValue([seededArticle]),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  let controller: KnowledgeBaseController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [{ provide: KnowledgeBaseService, useValue: serviceMock }],
    }).compile();
    controller = moduleRef.get(KnowledgeBaseController);
  });

  it('GET /kb/articles?module=hr returns seeded articles for the module', async () => {
    const result = await controller.list('hr');
    expect(serviceMock.list).toHaveBeenCalledWith('hr');
    expect(result).toEqual([seededArticle]);
  });

  it('GET /kb/articles/:module/:tabKey returns a single seeded article', async () => {
    const result = await controller.findOne('hr', 'employees');
    expect(serviceMock.findOne).toHaveBeenCalledWith('hr', 'employees');
    expect(result).toEqual(seededArticle);
  });

  it('GET /kb/search?q=... delegates to the service search', async () => {
    const result = await controller.search('payroll');
    expect(serviceMock.search).toHaveBeenCalledWith('payroll');
    expect(result).toEqual([seededArticle]);
  });

  describe('write endpoint permission gating (RolesGuard)', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    function contextFor(handlerName: keyof KnowledgeBaseController, role: UserRole | undefined): ExecutionContext {
      const handler = (controller as any)[handlerName].bind(controller);
      // Roles decorator metadata is attached via SetMetadata on the real
      // controller class prototype, so read it from there directly.
      const realHandler = (KnowledgeBaseController.prototype as any)[handlerName];
      return {
        getHandler: () => realHandler,
        getClass: () => KnowledgeBaseController,
        switchToHttp: () => ({
          getRequest: () => ({ user: role ? { role } : undefined }),
        }),
      } as unknown as ExecutionContext;
    }

    it.each(['create', 'update', 'remove'] as const)(
      'rejects %s for a non-super-admin role',
      (handlerName) => {
        const ctx = contextFor(handlerName, UserRole.HR_MANAGER);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      },
    );

    it.each(['create', 'update', 'remove'] as const)(
      'allows %s for SUPER_ADMIN',
      (handlerName) => {
        const ctx = contextFor(handlerName, UserRole.SUPER_ADMIN);
        expect(guard.canActivate(ctx)).toBe(true);
      },
    );

    it('rejects a write when no user is present on the request', () => {
      const ctx = contextFor('create', undefined);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('the read handlers carry no @Roles metadata, so RolesGuard allows any authenticated role', () => {
      const ctx = contextFor('list', UserRole.TEACHER);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
