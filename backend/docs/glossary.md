# Glossary

The domain terms the backend code, comments and tests use. A capitalised word in a comment
(Account, Session, Allowance) means the term as defined here.

## Identity

**Student**:
A person learning on Becan. Every Student has exactly one Account.
_Avoid_: user (outside the auth tables), learner, member

**Account**:
The Student's one record on Becan: their name, email, phone number, Institution and Major.
Stored in the auth library's `user` table, which is called the "user row", never "account".
_Avoid_: user, profile

**Sign-in method**:
One way a Student can prove they own their Account: a password or Google (later, phone). One Account
can have several. Google can only sign in to an existing Account or link to one with the same verified
email; an Account is only created through Google from the join page, which collects the phone number,
Institution and Major first. An Admin never uses Google.
_Avoid_: account (the auth library's table name), credential, provider

**Device session**:
One signed-in browser or device for an Account. Signing out or resetting the password ends it.
_Avoid_: login, token

**Role**:
The set of permissions an Account holds. There are two: Student, which every Account starts with,
and Admin.
_Avoid_: account type, user type, normal user, level

**Admin**:
A person whose Account holds the Admin Role, which lets them run the admin dashboard and study any
Chapter without limits. An Admin may also study, but is never counted as a Student for Usage.
_Avoid_: staff, superuser, moderator, operator

## Administration

**Ban**:
An Admin's block on an Account that ends its Device sessions and stops it signing in, until an Admin
lifts it or its set end passes. The Account and its history are kept.
_Avoid_: suspension, deactivation, block

**Account removal**:
Permanently erasing an Account and everything tied to it. Unlike a Ban, it cannot be undone.
_Avoid_: deactivation, Ban

**Impersonation**:
An Admin acting as another Account for a limited time to see what its owner sees. It never starts a
Session and never targets another Admin.
_Avoid_: log in as, masquerade

**Admin Session**:
A Session an Admin starts. It needs no Enrollment, may open an unpublished Chapter, is not bound by
any Allowance and never counts as Usage.
_Avoid_: test session, preview session, unlimited session

**Audit log**:
The record of every Admin action: who acted, on which Account, what changed, and when.
_Avoid_: activity log, history

## Insights

**Held Session**:
A Student's Session that the Student actually joined, counted in the day it was first joined. A Session
that was issued but never joined, and every Admin Session, is not one.
_Avoid_: attended session, completed session

**Active Student**:
A Student with at least one Held Session in a period of time (a day, a week, or the whole range).
Counted once per period however many Held Sessions they had.
_Avoid_: active user, DAU, engaged student

**Study seconds**:
The seconds a Student was present in Held Sessions, counted exactly as Usage counts them.
_Avoid_: minutes studied, watch time

_Insights_ is the admin dashboard's home page of these figures (`GET /api/v1/admin/insights`). Its
days and weeks follow Riyadh time (Asia/Riyadh), and a week starts on Sunday.

## Academic placement

**Institution**:
A place where a Student studies, such as King Saud University.
_Avoid_: university, school, college

**Major**:
A field of study offered by exactly one Institution. The same subject at two Institutions is two
Majors.
_Avoid_: program, specialization, department

_Not "catalog":_ Institutions and Majors are not a catalog. "Catalog" is reserved for courses.

## Learning

**Catalog**:
Every Course Becan offers; Students choose from it and never add to it. It is managed by hand with
SQL (ADR 0007).
_Avoid_: course list, library

**Course**:
One university course as one Institution teaches it, split into Chapters; the same subject at two
Institutions is two Courses. Its id is its slug, such as `acct-101`.
_Avoid_: subject, class, module

**Chapter**:
One part of a Course and the unit a Session teaches. It is identified by its number within the
Course, and its teaching material is one folder in object storage. A Chapter is either Published (open to
enrolled Students) or Coming soon (listed, but no Session can open it; an Admin Session can).
_Avoid_: lesson, unit, section

**Lesson**:
One of the ordered parts a Chapter is taught in.
_Avoid_: topic, chapter

**Enrollment**:
A Student's hold on one Course that lets them open its Chapters, active until it ends;
un-enrolling ends it, and an ended Enrollment is kept, never erased.
A Student has at most one active Enrollment per Course.
_Avoid_: subscription, registration, course membership

**Session**:
One sitting in which the tutor teaches one Student one Chapter, from start to end; a Student has
at most one Session open at a time.
_Avoid_: Device session (that is sign-in), lesson, call, room

## Plans

**Plan**:
A named set of limits on what a Student may use; every Student is on exactly one Plan at a time.
_Avoid_: tier, subscription, package

**Price**:
What one Period of a Plan costs, VAT (15%) included, stored in halalas. The Free Plan's Price is 0.
No payment is taken yet: nothing assigns a paid Plan.
_Avoid_: fee, cost

**Listed**:
A Plan shown to visitors and Students on the pricing pages (`GET /api/v1/plans`). An unlisted Plan
still exists and can be held.

**Allowance**:
What a Plan lets a Student use in one Period: Sessions started, minutes of Session time, and
Courses held in active Enrollments at once.
_Avoid_: quota (outside code), credits, balance

**Usage**:
How much of the Allowance a Student has used in the current Period.
_Avoid_: consumption, spend

**Period**:
The 30-day window an Allowance applies to; when one ends the next begins and Usage restarts at zero.
_Avoid_: month, billing cycle
